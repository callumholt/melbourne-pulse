"use client";

import { useState } from "react";
import { Bell, X, Check } from "lucide-react";
import { PRECINCTS } from "@/lib/constants";

export function AlertSubscribeDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [precinct, setPrecinct] = useState("");
  const [severity, setSeverity] = useState("significant");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          precinct: precinct || undefined,
          severity,
        }),
      });

      if (res.ok) {
        setStatus("success");
        setTimeout(() => {
          setOpen(false);
          setStatus("idle");
          setEmail("");
        }, 2000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-3.5 w-3.5" />
        Get Alerts
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-border/40 bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Subscribe to Anomaly Alerts</h3>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === "success" ? (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check className="h-4 w-4" />
            Subscribed successfully
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Precinct (optional)</label>
              <select
                value={precinct}
                onChange={(e) => setPrecinct(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">All precincts</option>
                {PRECINCTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Minimum Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="moderate">Moderate (z &gt; 2)</option>
                <option value="significant">Significant (z &gt; 3)</option>
                <option value="extreme">Extreme (z &gt; 4)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {status === "loading" ? "Subscribing..." : "Subscribe"}
            </button>

            {status === "error" && (
              <p className="text-xs text-red-400">Something went wrong. Please try again.</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

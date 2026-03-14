import { Resend } from "resend";
import { getDb } from "./db";
import type { Anomaly } from "./anomaly-detection";

const SEVERITY_ORDER = { moderate: 0, significant: 1, extreme: 2 } as const;

interface Subscription {
  id: number;
  email: string;
  precinct_filter: string | null;
  min_severity: "moderate" | "significant" | "extreme";
}

/**
 * Process anomalies: find matching subscriptions and send alert emails.
 */
export async function processAlerts(anomalies: Anomaly[]): Promise<number> {
  if (anomalies.length === 0) return 0;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return 0;

  const resend = new Resend(resendKey);
  const sql = getDb();

  // Get all verified subscriptions
  const subs = await sql`
    SELECT id, email, precinct_filter, min_severity
    FROM alert_subscriptions
    WHERE verified = TRUE
  ` as unknown as Subscription[];

  let sent = 0;

  for (const sub of subs) {
    const minLevel = SEVERITY_ORDER[sub.min_severity];

    // Filter anomalies matching this subscription
    const matching = anomalies.filter((a) => {
      if (sub.precinct_filter && a.precinct_id !== sub.precinct_filter) return false;
      return SEVERITY_ORDER[a.severity] >= minLevel;
    });

    if (matching.length === 0) continue;

    const subject = matching.length === 1
      ? `Melbourne Pulse Alert: ${matching[0].severity} anomaly in ${matching[0].precinct_id}`
      : `Melbourne Pulse Alert: ${matching.length} anomalies detected`;

    const body = matching
      .map((a) => `- ${a.precinct_id}: ${a.explanation ?? `${a.severity} anomaly`} (z-score: ${a.z_score})`)
      .join("\n");

    try {
      await resend.emails.send({
        from: "Melbourne Pulse <alerts@melbourne-pulse.vercel.app>",
        to: sub.email,
        subject,
        text: `${subject}\n\n${body}\n\nView dashboard: https://melbourne-pulse.vercel.app`,
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send alert to ${sub.email}:`, err);
    }
  }

  return sent;
}

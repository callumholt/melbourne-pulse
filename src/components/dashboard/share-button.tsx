"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { buildShareUrl, type MapState } from "@/lib/share-state";

interface ShareButtonProps {
  getState: () => MapState;
}

export function ShareButton({ getState }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const state = getState();
    const url = buildShareUrl(state);

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: prompt
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1 rounded-md border border-border/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Copy shareable link"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-400" />
          <span className="text-green-400">Copied</span>
        </>
      ) : (
        <>
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Share</span>
        </>
      )}
    </button>
  );
}

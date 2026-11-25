"use client";

import { useState } from "react";

export function CopyEndpointButton({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle" onClick={async () => {
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
  }}>
    {copied ? "Copied" : "Copy URL"}
  </button>;
}

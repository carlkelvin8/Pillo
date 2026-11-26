"use client";

import { useState } from "react";

export function CopyEndpointButton({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-control border-line-strong bg-surface text-ink hover:bg-subtle min-h-11 border px-4 text-sm font-semibold"
      onClick={async () => {
        await navigator.clipboard.writeText(endpoint);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : "Copy URL"}
    </button>
  );
}

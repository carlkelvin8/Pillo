"use client";

import { COPY_STATUS_TEXT, useCopyText } from "./use-copy-text";

/** The endpoint URL with a copy button; falls back to selecting the URL when copying fails. */
export function CopyEndpointButton({ endpoint }: { endpoint: string }) {
  const { target, status, copy } = useCopyText<HTMLElement>();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <code
          ref={target}
          className="rounded-control border-line-strong bg-surface text-ink min-w-0 flex-1 overflow-x-auto border px-4 py-3 font-mono text-sm"
          aria-label="MCP endpoint URL"
        >
          {endpoint}
        </code>
        <button
          type="button"
          className="rounded-control border-line-strong bg-surface text-ink hover:bg-subtle min-h-11 border px-4 text-sm font-semibold"
          onClick={() => void copy(endpoint)}
        >
          {status === "copied" ? "Copied" : "Copy URL"}
        </button>
      </div>
      <span role="status" className="text-surface/80 text-sm empty:hidden">
        {status ? COPY_STATUS_TEXT[status] : ""}
      </span>
    </div>
  );
}

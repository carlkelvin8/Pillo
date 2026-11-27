"use client";

import { useRef, useState, type RefObject } from "react";

export type CopyStatus = "copied" | "selected" | null;

export const COPY_STATUS_TEXT: Record<Exclude<CopyStatus, null>, string> = {
  copied: "Copied.",
  selected: "Selected. Press Ctrl+C to copy.",
};

/** Select the target's text so the user can copy it by hand. */
function selectTarget(target: HTMLElement | null) {
  if (!target) return;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    target.focus();
    target.select();
    return;
  }
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Copy with the clipboard API; when it is missing (insecure page, old browser) or refused, select
 * the text instead and report "selected" so the UI can tell the user to press Ctrl+C.
 */
export function useCopyText<T extends HTMLElement>(): {
  target: RefObject<T | null>;
  status: CopyStatus;
  copy: (text: string) => Promise<void>;
} {
  const target = useRef<T>(null);
  const [status, setStatus] = useState<CopyStatus>(null);
  async function copy(text: string) {
    try {
      const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
      await clipboard.writeText(text);
      setStatus("copied");
    } catch {
      selectTarget(target.current);
      setStatus("selected");
    }
  }
  return { target, status, copy };
}

"use client";

import { useState } from "react";

/** Copies text to the clipboard and says so. Falls back to "select it" if the browser refuses. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className="btn secondary small"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => setState("copied"),
          () => setState("failed"),
        );
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Select & copy" : label}
    </button>
  );
}

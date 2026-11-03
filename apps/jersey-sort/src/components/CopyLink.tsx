"use client";

import { useState } from "react";

/** The gallery's link, with a button that copies it. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="input min-w-64 flex-1 font-mono text-xs"
        readOnly
        value={url}
        aria-label="Team gallery link"
        data-testid="gallery-link"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopied(true));
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

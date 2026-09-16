"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * A two-step confirmation for anything that cannot be undone.
 *
 * Used for ending a game, deleting a team and deleting an account. A single
 * mis-tap on END GAME during a substitution would close the log and stop the
 * clock for every athlete on the field, so it deliberately takes two.
 */
export function Confirm({
  label,
  question,
  confirmLabel,
  onConfirm,
  className = "btn-danger btn-block",
  children,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <strong>{question}</strong>
      {children ? (
        <p className="muted" style={{ marginTop: 6 }}>
          {children}
        </p>
      ) : null}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" onClick={() => setAsking(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

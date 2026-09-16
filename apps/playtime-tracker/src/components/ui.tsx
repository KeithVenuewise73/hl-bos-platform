"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ComplianceStatus } from "@hl-bos/playtime-engine";
import { STATUS_LABEL } from "@hl-bos/playtime-engine";

/**
 * The shared pieces.
 *
 * Every screen in this app has an explicit empty, loading and error state, and
 * they live here so none of them can be quietly skipped. A screen that renders
 * nothing while it decides what to show is a screen that looks broken on a
 * cold morning with one bar of signal.
 */

export function TopBar({
  back,
  title,
  action,
}: {
  back?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div className="topbar">
      {back ? (
        <Link className="back" href={back}>
          ‹ Back
        </Link>
      ) : null}
      {title ? <strong>{title}</strong> : null}
      <div className="spacer" />
      {action}
    </div>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p className="muted">{children}</p> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}

/** Shown while the device is reading local storage. Deliberately not a spinner. */
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="muted">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="banner banner-error" role="alert">
      {children}
    </div>
  );
}

export function WarnNote({ children }: { children: ReactNode }) {
  return (
    <div className="banner banner-warn" role="status">
      {children}
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="banner banner-info" role="status">
      {children}
    </div>
  );
}

const PILL_CLASS: Readonly<Record<ComplianceStatus, string>> = {
  safe: "pill pill-safe",
  at_risk: "pill pill-risk",
  below_target: "pill pill-below",
  no_target: "pill pill-none",
};

/**
 * The compliance indicator.
 *
 * Carries its own text, not just a colour: in direct sunlight, and for anyone
 * colour-blind, a green dot and an amber dot are the same dot.
 */
export function StatusPill({ status }: { status: ComplianceStatus }) {
  if (status === "no_target") return null;
  return <span className={PILL_CLASS[status]}>{STATUS_LABEL[status]}</span>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  // `| undefined` is required by exactOptionalPropertyTypes: callers compute
  // the hint conditionally and pass undefined when there is nothing to say.
  hint?: string | undefined;
  children: ReactNode;
}) {
  // The control is nested INSIDE the label rather than sitting next to it.
  // That is what actually associates the two: a <label> with no `for` and no
  // child control reads to a screen reader as loose text, and tapping it does
  // not focus anything.
  return (
    <div className="field">
      <label>
        <span className="field-label">{label}</span>
        {children}
      </label>
      {hint ? (
        <div className="muted" style={{ marginTop: 6 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

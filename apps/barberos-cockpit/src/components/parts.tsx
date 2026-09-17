"use client";

import type { ReactNode } from "react";

import type { Capability, Confidence, EnabledCapability, PipelineRun } from "@/lib/api";
import {
  capabilityBlocker,
  evidenceWord,
  missingPrerequisites,
  scoreDisplay,
} from "@/lib/model";
import type { Notice } from "@/lib/hooks";

/**
 * Loading, refusal and emptiness, in one place.
 *
 * `empty` is required, not optional: a panel with no data has to say what it
 * would show and why it is not showing it. An empty panel that explains itself
 * beats a green one that lies, and the only way to guarantee one is to make
 * the explanation impossible to omit.
 */
export function Loaded<T>({
  state,
  empty,
  isEmpty,
  children,
}: {
  state: { data: T | null; loading: boolean; error: string | null };
  empty: ReactNode;
  isEmpty?: ((d: T) => boolean) | undefined;
  children: (d: T) => ReactNode;
}) {
  if (state.loading) return <div className="dim">Loading…</div>;
  if (state.error) return <div className="banner bdanger">{state.error}</div>;
  if (state.data === null) return <>{empty}</>;
  if (isEmpty?.(state.data)) return <>{empty}</>;
  return <>{children(state.data)}</>;
}

export function Toast({
  notice,
  onClose,
}: {
  notice: Notice | null;
  onClose: () => void;
}) {
  if (!notice) return null;
  return (
    <div className={`toast ${notice.kind}`} role="status">
      <div className="row spread" style={{ alignItems: "flex-start" }}>
        <span>{notice.text}</span>
        <button className="btn sm" onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}

/** The confidence of a single finding, as a label that survives skim-reading. */
export function Evidence({ confidence }: { confidence: Confidence }) {
  return <span className={`ev ${confidence}`}>{evidenceWord(confidence)}</span>;
}

export function FindingCard({
  statement,
  confidence,
  evidenceUrl,
  dimension,
  severity,
}: {
  statement: string;
  confidence: Confidence;
  evidenceUrl: string | null;
  dimension?: string | undefined;
  severity?: string | undefined;
}) {
  return (
    <div className={`finding is-${confidence}`}>
      <div className="st">{statement}</div>
      <div className="meta">
        <Evidence confidence={confidence} />
        {dimension && <span>{dimension.replace(/_/g, " ")}</span>}
        {severity && <span>{severity}</span>}
        {evidenceUrl ? (
          <a
            href={evidenceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="muted"
          >
            evidence ↗
          </a>
        ) : (
          // Stated, not omitted: an absent evidence link is the fact that
          // decides whether this sentence may be repeated to the shop.
          <span>no evidence recorded — inference only</span>
        )}
      </div>
    </div>
  );
}

/** A composite score with the coverage it came from, never one without the other. */
export function Score({ run }: { run: PipelineRun | null }) {
  const d = scoreDisplay(run);
  return (
    <div>
      <div className="stat-value" style={{ fontSize: 24 }}>
        {d.value}
        {d.value !== "—" && (
          <span className="dim" style={{ fontSize: 14 }}>
            {" "}
            /100
          </span>
        )}
      </div>
      <div className={d.complete ? "dim" : "muted"} style={{ fontSize: 12 }}>
        {d.qualifier}
      </div>
    </div>
  );
}

/**
 * One capability, with its real state and — where it cannot be switched on —
 * the reason and who owns clearing it.
 *
 * `onToggle` is omitted when the operator lacks barberos.capability.manage, so
 * the control is absent rather than present and refused.
 */
export function CapabilityRow({
  capability,
  enabled,
  enabledState,
  busy,
  onToggle,
}: {
  capability: Capability;
  enabled: boolean;
  enabledState: EnabledCapability[];
  busy: boolean;
  onToggle?: ((on: boolean) => void) | undefined;
}) {
  const blocker = capabilityBlocker(capability);
  const missing = missingPrerequisites(capability, enabledState);
  const canEnable = blocker === null && missing.length === 0;

  return (
    <div className={`cap${enabled ? " on" : ""}`}>
      <div>
        <div className="row" style={{ gap: 8 }}>
          <span className="nm">{capability.name}</span>
          {enabled && <span className="badge ok">On</span>}
          {capability.status !== "available" && (
            <span
              className={`badge ${capability.status === "deferred" ? "danger" : "warn"}`}
            >
              {capability.status}
            </span>
          )}
        </div>
        <div className="ds">{capability.description}</div>
        {blocker && <div className="blk">{blocker}</div>}
        {!blocker && missing.length > 0 && (
          <div className="blk">
            Needs {missing.map((m) => m.key).join(", ")} switched on first —{" "}
            {missing[0]!.reason}
          </div>
        )}
        {capability.locked_config_keys.length > 0 && (
          <div className="req">
            Locked at the schema and not configurable here:{" "}
            {capability.locked_config_keys.join(", ")}.
          </div>
        )}
      </div>
      <div>
        {onToggle === undefined ? (
          <span className="dim" style={{ fontSize: 12 }}>
            You cannot change this
          </span>
        ) : enabled ? (
          <button className="btn sm" disabled={busy} onClick={() => onToggle(false)}>
            Switch off
          </button>
        ) : (
          <button
            className="btn sm primary"
            disabled={busy || !canEnable}
            title={blocker ?? (missing.length ? "Prerequisite missing" : undefined)}
            onClick={() => onToggle(true)}
          >
            Switch on
          </button>
        )}
      </div>
    </div>
  );
}

export function Crumbs({
  trail,
}: {
  trail: { label: string; go?: (() => void) | undefined }[];
}) {
  return (
    <div className="crumbs">
      {trail.map((t, i) => (
        <span key={i}>
          {i > 0 && " / "}
          {t.go ? <button onClick={t.go}>{t.label}</button> : <span>{t.label}</span>}
        </span>
      ))}
    </div>
  );
}

export function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: ReactNode | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="page-head row spread" style={{ alignItems: "flex-start" }}>
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The panel shown INSTEAD of a form whose capability is switched off.
 *
 * barberos.require_capability() is a trigger on eight tables: sites, site_hours,
 * site_services and site_links need `owned_website`, and clients, visits,
 * visit_tools and tools need `client_crm`. A write to any of them with the
 * capability off is refused outright, which is what makes a disabled capability
 * genuinely off rather than merely hidden in a UI.
 *
 * So a form over one of those tables is a control that cannot do its job until
 * the capability is on. This states the reason and offers the one action that
 * fixes it, rather than letting somebody fill a form that will be refused on
 * submit.
 */
export function CapabilityGate({
  capability,
  name,
  what,
  canEnable,
  busy,
  onEnable,
}: {
  capability: string;
  name: string;
  what: string;
  canEnable: boolean;
  busy: boolean;
  onEnable: () => void;
}) {
  return (
    <div className="empty" style={{ textAlign: "left" }}>
      <div style={{ fontWeight: 600 }}>{name} is not switched on for this shop</div>
      <p style={{ fontSize: 13.5, marginBottom: 10 }}>
        {what} The database refuses the write itself — a trigger on those tables checks
        the capability — so this is not a display rule that could be worked around.
      </p>
      {canEnable ? (
        <button className="btn primary" disabled={busy} onClick={onEnable}>
          Switch on {name}
        </button>
      ) : (
        <span className="dim" style={{ fontSize: 12.5 }}>
          You do not have the permission to switch it on. The capability key is{" "}
          {capability}.
        </span>
      )}
    </div>
  );
}

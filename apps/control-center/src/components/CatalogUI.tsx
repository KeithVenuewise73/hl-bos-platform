import type { ReactNode } from "react";
import type { Asset, ReuseFlag, Maturity, Health } from "@hl-bos/catalog";
import {
  REUSE_LABEL,
  MATURITY_LABEL,
  MATURITY_HEALTH,
  KIND_LABEL,
} from "@hl-bos/catalog";
import { DOT } from "@/components/ui";

/** A big number tile for the executive dashboard. */
export function Tile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "#12151a",
        border: "1px solid #262c36",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: accent ?? "#e8eaed",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>{label}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: "#6e7681", marginTop: 2 }}>{hint}</div>
      ) : null}
    </div>
  );
}

/** A labelled progress bar (completeness / percentages). */
export function Bar({ label, pct, sub }: { label: string; pct: number; sub?: string }) {
  const color = pct >= 100 ? "#3fb950" : pct >= 60 ? "#d29922" : "#f85149";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
        <span>{label}</span>
        <span style={{ color: "#8b949e", fontFamily: "ui-monospace, monospace" }}>
          {pct}%{sub ? ` · ${sub}` : ""}
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "#21262d",
          borderRadius: 999,
          overflow: "hidden",
          marginTop: 5,
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

const REUSE_COLOR: Record<ReuseFlag, string> = {
  reusable: "#238636",
  commercial: "#1f6feb",
  internal_only: "#6e7681",
  requires_refactor: "#9e6a03",
  requires_documentation: "#9e6a03",
  requires_testing: "#9e6a03",
  deprecated: "#da3633",
};

export function ReusePill({ flag }: { flag: ReuseFlag }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 999,
        marginRight: 6,
        marginBottom: 4,
        background: "#0d1117",
        border: `1px solid ${REUSE_COLOR[flag]}`,
        color: "#c9d1d9",
      }}
    >
      {REUSE_LABEL[flag]}
    </span>
  );
}

export function MaturityBadge({ maturity }: { maturity: Maturity }) {
  const h: Health = MATURITY_HEALTH[maturity];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        color: "#c9d1d9",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: DOT[h],
          marginRight: 6,
          display: "inline-block",
        }}
      />
      {MATURITY_LABEL[maturity]}
    </span>
  );
}

/** A single asset row used in browse and search results. */
export function AssetRow({ asset }: { asset: Asset }) {
  return (
    <a
      href={`/catalog/asset/${encodeURIComponent(asset.id)}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          padding: "11px 0",
          borderBottom: "1px solid #1c2128",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{asset.name}</span>
          <MaturityBadge maturity={asset.maturity} />
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "#8b949e",
            margin: "3px 0 6px",
            lineHeight: 1.5,
          }}
        >
          {asset.summary}
        </div>
        <div>
          <span style={{ fontSize: 11, color: "#6e7681", marginRight: 8 }}>
            {KIND_LABEL[asset.kind].one} · {asset.layer}
          </span>
          {asset.reuse.map((f) => (
            <ReusePill key={f} flag={f} />
          ))}
        </div>
      </div>
    </a>
  );
}

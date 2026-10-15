"use client";

import { useState, useTransition } from "react";

import { approvePremiumSite, buildPremiumSite } from "@/actions/premium";
import type { PresenceResult } from "@/lib/presence";

import { Status } from "./DemoControls";
import { button, C } from "./presence-style";

export function BuildPremiumButton({
  id,
  hasDraft,
}: {
  id: string;
  hasDraft: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          fd.set("id", id);
          const r = await buildPremiumSite(fd);
          setResult(r);
          if (r.ok && r.href && window.location.pathname !== r.href)
            window.location.assign(r.href);
          else if (r.ok) window.location.reload();
        })
      }
    >
      <button type="submit" disabled={pending} style={button(true, pending)}>
        {pending
          ? "Building…"
          : hasDraft
            ? "Rebuild premium site"
            : "Build Premium Business Site"}
      </button>
      <Status r={result} linkText="Open the review →" />
    </form>
  );
}

export function ApprovePremiumButton({
  id,
  approved,
}: {
  id: string;
  approved: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          fd.set("id", id);
          setResult(await approvePremiumSite(fd));
        })
      }
    >
      <button
        type="submit"
        disabled={pending || approved}
        style={button(true, pending || approved)}
      >
        {approved ? "Design approved" : "Approve this design"}
      </button>
      <span style={{ marginLeft: 10, fontSize: 12, color: C.muted }}>
        Internal sign-off only. Approval does not publish the site or configure an
        address.
      </span>
      <Status r={result} />
    </form>
  );
}

const DEVICES = [
  { key: "desktop", label: "Desktop", width: 1280 },
  { key: "tablet", label: "Tablet", width: 820 },
  { key: "mobile", label: "Mobile", width: 390 },
] as const;

/** Device and page switcher around a sandboxed preview of the draft. */
export function PremiumPreview({
  base,
  pages,
}: {
  base: string;
  pages: { file: string; label: string }[];
}) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [page, setPage] = useState(pages[0]!.file);
  const tab = (active: boolean): React.CSSProperties => ({
    ...button(false, false),
    background: active ? "#1f6feb" : "#21262d",
    borderColor: active ? "#388bfd" : C.border,
    padding: "6px 12px",
    fontSize: 12.5,
  });
  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <div role="group" aria-label="Device" style={{ display: "flex", gap: 6 }}>
          {DEVICES.map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={device.key === d.key}
              onClick={() => setDevice(d)}
              style={tab(device.key === d.key)}
            >
              {d.label} · {d.width}px
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label="Page"
          style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
        >
          {pages.map((p) => (
            <button
              key={p.file}
              type="button"
              aria-pressed={page === p.file}
              onClick={() => setPage(p.file)}
              style={tab(page === p.file)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <a
          href={`${base}/${page}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: C.link, fontSize: 13 }}
        >
          Open this page full size
        </a>
      </div>
      <div
        style={{
          background: "#0b0d10",
          border: "1px solid #262c36",
          borderRadius: 12,
          padding: 12,
          overflowX: "auto",
        }}
      >
        <iframe
          key={`${device.key}-${page}`}
          title={`Premium site preview: ${page} at ${device.width} pixels`}
          src={`${base}/${page}`}
          sandbox=""
          style={{
            width: device.width,
            maxWidth: device.key === "desktop" ? "100%" : device.width,
            height: 900,
            border: 0,
            borderRadius: 8,
            background: "#fff",
            display: "block",
            margin: "0 auto",
          }}
        />
      </div>
    </div>
  );
}

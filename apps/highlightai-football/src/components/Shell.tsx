import type { ReactNode } from "react";
import { DEMO_NOTICE } from "@/lib/mode";

const NAV: ReadonlyArray<{
  label: string;
  links: ReadonlyArray<{ href: string; text: string }>;
}> = [
  {
    label: "Film",
    links: [
      { href: "/", text: "Dashboard" },
      { href: "/upload", text: "Upload Game" },
      { href: "/games", text: "Games" },
      { href: "/processing", text: "Game Processing" },
    ],
  },
  {
    label: "The athlete",
    links: [
      { href: "/select-player", text: "Select Player" },
      { href: "/confirm-player", text: "Player Confirmation" },
      { href: "/players", text: "Players" },
    ],
  },
  {
    label: "Highlights",
    links: [
      { href: "/analysis", text: "Game Analysis" },
      { href: "/plays", text: "Detected Plays" },
      { href: "/editor", text: "Highlight Editor" },
      { href: "/preview", text: "Reel Preview" },
      { href: "/export", text: "Export" },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/settings", text: "Settings" },
      { href: "/debug", text: "AI Debug View" },
    ],
  },
];

export function Shell({
  children,
  active,
  isDemo,
}: {
  children: ReactNode;
  active: string;
  isDemo: boolean;
}) {
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <div className="brand-name">
            Highlight<span>AI</span> Football
          </div>
          <div className="brand-tag">
            Upload the game. Pick the player.
            <br />
            HighlightAI does the rest.
          </div>
        </div>
        {NAV.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-group-label">{group.label}</div>
            {group.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="nav-link"
                data-active={active === link.href ? "true" : "false"}
              >
                {link.text}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <main className="main">
        {isDemo ? <DemoBanner /> : null}
        {children}
      </main>
    </div>
  );
}

/**
 * The demo banner.
 *
 * It is on every screen, it is not dismissible, and it says the football is
 * generated. A demo whose output is indistinguishable from a real analysis is
 * the exact failure this product cannot afford.
 */
export function DemoBanner() {
  return (
    <div className="demo-banner">
      <strong>DEMO GAME — not real film.</strong> {DEMO_NOTICE}
    </div>
  );
}

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="page-head">
      <h1 className="page-title">{title}</h1>
      {sub !== undefined ? <p className="page-sub">{sub}</p> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
  muted,
}: {
  label: string;
  value: string;
  note?: string;
  muted?: boolean;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={muted === true ? "stat-value muted" : "stat-value"}>{value}</div>
      {note !== undefined ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

export function Meter({
  value,
  tone,
  indeterminate,
}: {
  value: number;
  tone?: "ok" | "warn" | "danger";
  indeterminate?: boolean;
}) {
  return (
    <div className="meter">
      <div
        className="meter-fill"
        data-tone={tone ?? "ok"}
        data-indeterminate={indeterminate === true ? "true" : "false"}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </div>
  );
}

/** An empty panel that explains itself, rather than a green one that lies. */
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

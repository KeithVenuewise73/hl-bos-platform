"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_GROUPS, activeKey, navFor, ROLE_LABEL } from "@/lib/access";
import type { FootballRole } from "@/lib/access";

/**
 * The application shell.
 *
 * Desktop: a left rail grouped by how a coaching staff actually works — Film
 * Room, Program, Intelligence, System — rather than a flat alphabetical list.
 * Mobile: the same items become a bottom bar, because section 41's user is a
 * coach standing on a practice field holding a phone in one hand.
 *
 * Navigation is filtered by football role, which is decided server-side and
 * passed in. This hides items; it does not protect them. The database does
 * that.
 */
export function Shell({
  role,
  teamName,
  isDemo,
  children,
}: {
  role: FootballRole | null;
  teamName: string | null;
  isDemo: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = activeKey(pathname);
  const items = navFor(role);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <div className="brand-name">FilmStudy AI</div>
          <div className="brand-sub">Venuewise Football</div>
          {teamName !== null ? (
            <div style={{ marginTop: 10 }}>
              <div className="small" style={{ fontWeight: 600 }}>
                {teamName}
              </div>
              <div className="tiny faint">
                {role === null ? "No role" : ROLE_LABEL[role]}
              </div>
              {isDemo ? (
                <div style={{ marginTop: 6 }}>
                  <span className="badge demo">Demo data</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group.group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group.group}>
              <div className="nav-group-label">{group.label}</div>
              {groupItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.path}
                  className="nav-item"
                  {...(current === item.key ? { "aria-current": "page" as const } : {})}
                >
                  <span className="glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                  <span className="desktop-label">{item.label}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

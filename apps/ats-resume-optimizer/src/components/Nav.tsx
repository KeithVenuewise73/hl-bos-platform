"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: readonly { readonly href: string; readonly label: string }[] = [
  { href: "/start", label: "Your job search" },
  { href: "/intake", label: "1 · Search profile" },
  { href: "/experience", label: "2 · Experience & resume" },
  { href: "/jobs", label: "3 · Find jobs" },
  { href: "/pipeline", label: "4 · Applications" },
  { href: "/linkedin", label: "5 · LinkedIn" },
  { href: "/account", label: "Account & data" },
  { href: "/", label: "Optimizer dashboard" },
  { href: "/profile", label: "Candidate Profile" },
  { href: "/master-resume", label: "Master Resume" },
  { href: "/analyze", label: "New Job Analysis" },
  { href: "/applications", label: "Applications" },
  { href: "/library", label: "Resume Library" },
  { href: "/settings", label: "Settings" },
];

/**
 * The permanent left rail. It is a client component for one reason: it needs
 * the current path to mark the active link, and `usePathname` is the only way
 * to get that without threading a prop through every page.
 */
export function Nav({ signedInAs }: { signedInAs?: string | null }) {
  const current = usePathname() ?? "/";
  return (
    <aside className="sidebar">
      <Link className="brand" href="/">
        <div className="brand-name">HLG Career Platform</div>
        <div className="brand-tag">Optimize aggressively. Fabricate nothing.</div>
      </Link>
      <nav className="nav" aria-label="Main">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={
              link.href === "/"
                ? current === "/"
                  ? "page"
                  : undefined
                : current.startsWith(link.href)
                  ? "page"
                  : undefined
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {signedInAs === undefined || signedInAs === null ? null : (
        <form action="/logout" method="post" style={{ marginTop: 18 }}>
          <div className="small muted" style={{ padding: "0 10px 6px" }}>
            {signedInAs}
          </div>
          <button className="btn btn-sm" type="submit" style={{ width: "100%" }}>
            Sign out
          </button>
        </form>
      )}
    </aside>
  );
}

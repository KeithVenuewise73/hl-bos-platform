import Link from "next/link";

import { signOutAction } from "@/actions/auth.ts";
import type { SessionUser } from "@/lib/auth-core.ts";

import { Brand } from "./Brand.tsx";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/check", label: "Check a folder" },
  { href: "/photos", label: "Photos" },
  { href: "/players", label: "Players" },
  { href: "/albums", label: "Albums" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export function Nav({
  user,
  reviewCount,
  processing,
}: {
  user: SessionUser;
  reviewCount: number;
  processing: number;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link href="/" aria-label="JerseySort AI home">
          <Brand />
        </Link>
        <form action="/photos" className="ml-auto flex-1 sm:max-w-sm">
          <input
            className="input"
            type="search"
            name="q"
            placeholder="Search: 24, Dominic Herman, October 3…"
            aria-label="Search photos"
          />
        </form>
        <form action={signOutAction} className="hidden sm:block">
          <button
            className="text-xs text-muted hover:text-text"
            type="submit"
            title={`${user.email} · ${user.organizationName}`}
          >
            Sign out
          </button>
        </form>
      </div>
      <nav
        className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2 text-sm"
        aria-label="Primary"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="whitespace-nowrap rounded-md px-3 py-1.5 font-semibold text-muted hover:bg-panel-2 hover:text-text"
          >
            {l.label}
            {l.href === "/review" && reviewCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] text-white">
                {reviewCount.toLocaleString()}
              </span>
            ) : null}
          </Link>
        ))}
        {processing > 0 ? (
          <span
            className="ml-auto self-center whitespace-nowrap px-2 text-xs text-brand-2"
            aria-live="polite"
          >
            ● Analyzing {processing.toLocaleString()}
          </span>
        ) : null}
        <form action={signOutAction} className="sm:hidden">
          <button
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-muted"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}

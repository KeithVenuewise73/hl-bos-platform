"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BRAND,
  NAV_PRIMARY,
  PRIMARY_CTA,
  PRIMARY_CTA_SHORT_LABEL,
} from "@/lib/content";
import {
  initialNavState,
  toggleNav,
  selectItem,
  onKey,
  type NavState,
} from "@/lib/nav";
import { effectiveHref } from "@/components/ui/primitives";

// Persistent site header (Homepage Copy S0). Desktop shows the full nav; mobile
// collapses it behind a disclosure button while the primary CTA stays visible
// (sticky) at every breakpoint. All open/close behavior is delegated to the pure
// helpers in lib/nav.ts, which the tests exercise directly.
export function SiteHeader() {
  const [nav, setNav] = useState<NavState>(initialNavState);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand">
          <span className="brand__mark">{BRAND.short}</span>
          <span className="brand__desc">{BRAND.descriptor}</span>
        </Link>

        <nav className="nav-desktop" aria-label="Primary">
          {NAV_PRIMARY.map((item) => (
            <Link
              key={item.label}
              href={effectiveHref(item)}
              className="nav-desktop__link"
              title={
                item.status === "pending" ? "This section is being prepared" : undefined
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <Link href={PRIMARY_CTA.href} className="btn btn--primary btn--sm header-cta">
            <span className="header-cta__full">{PRIMARY_CTA.label}</span>
            <span className="header-cta__short">{PRIMARY_CTA_SHORT_LABEL}</span>
          </Link>
          <button
            type="button"
            className="hamburger"
            aria-expanded={nav.open}
            aria-controls="mobile-nav"
            onClick={() => setNav(toggleNav)}
          >
            <span className="visually-hidden">
              {nav.open ? "Close menu" : "Open menu"}
            </span>
            <span aria-hidden="true" className="hamburger__glyph">
              {nav.open ? "✕" : "☰"}
            </span>
          </button>
        </div>
      </div>

      <nav
        id="mobile-nav"
        className={`nav-mobile${nav.open ? " nav-mobile--open" : ""}`}
        aria-label="Primary (mobile)"
        hidden={!nav.open}
        onKeyDown={(event) => setNav((state) => onKey(state, event.key))}
      >
        <div className="container">
          {NAV_PRIMARY.map((item) => (
            <Link
              key={item.label}
              href={effectiveHref(item)}
              className="nav-mobile__link"
              onClick={() => setNav(selectItem)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_PRIMARY, NAV_UTILITY } from "@/lib/content";

// A restrained, executive palette. Professional, modern, trustworthy — no
// gradients, no generic-AI imagery, no gimmicks. Styles are inline (CSP allows
// inline styles); no external CSS.
const INK = "#0f1720";
const PAPER = "#f7f8fa";
const LINE = "#e4e7ec";
const MUTED = "#5b6672";
const ACCENT = "#1f5f8b";

export function SiteHeader() {
  return (
    <header
      style={{
        borderBottom: `1px solid ${LINE}`,
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/"
          style={{ fontWeight: 700, fontSize: 16, color: INK, textDecoration: "none" }}
        >
          Herman Legacy <span style={{ color: ACCENT }}>Digital</span>
        </Link>
        <nav style={{ display: "flex", gap: 16, flexWrap: "wrap", flex: 1 }}>
          {NAV_PRIMARY.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{ fontSize: 13.5, color: MUTED, textDecoration: "none" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {NAV_UTILITY.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{ fontSize: 13.5, color: MUTED, textDecoration: "none" }}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/book"
            style={{
              fontSize: 13.5,
              background: ACCENT,
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Book an Assessment
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer
      style={{ borderTop: `1px solid ${LINE}`, background: "#fff", marginTop: 48 }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "28px 24px",
          fontSize: 12.5,
          color: MUTED,
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span>© Herman Legacy Digital — a Herman Legacy Group company.</span>
        <span style={{ display: "flex", gap: 14 }}>
          <Link href="/about" style={{ color: MUTED }}>
            About
          </Link>
          <Link href="/contact" style={{ color: MUTED }}>
            Contact
          </Link>
          <Link href="/login" style={{ color: MUTED }}>
            Client Login
          </Link>
        </span>
      </div>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: PAPER, minHeight: "100vh", color: INK }}>
      <SiteHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function Hero({ title, lede }: { title: string; lede: string }) {
  return (
    <section style={{ padding: "24px 0 32px" }}>
      <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: 0, maxWidth: 760 }}>
        {title}
      </h1>
      <p
        style={{
          fontSize: 17,
          color: MUTED,
          marginTop: 14,
          maxWidth: 680,
          lineHeight: 1.5,
        }}
      >
        {lede}
      </p>
    </section>
  );
}

export function Section({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ margin: "26px 0" }}>
      {heading ? <h2 style={{ fontSize: 20, margin: "0 0 12px" }}>{heading}</h2> : null}
      {children}
    </section>
  );
}

export function Grid({ children, min = 240 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        padding: "18px 18px",
      }}
    >
      {title ? (
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{title}</div>
      ) : null}
      <div style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export function CTA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        background: ACCENT,
        color: "#fff",
        padding: "11px 18px",
        borderRadius: 9,
        textDecoration: "none",
        fontSize: 14,
      }}
    >
      {children}
    </Link>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11.5,
        color: ACCENT,
        border: `1px solid ${ACCENT}`,
        borderRadius: 999,
        padding: "2px 9px",
      }}
    >
      {children}
    </span>
  );
}

export function ContentPage({
  copy,
  children,
}: {
  copy: { title: string; lede: string; sections: { heading: string; body: string }[] };
  children?: ReactNode;
}) {
  return (
    <Page>
      <Hero title={copy.title} lede={copy.lede} />
      {copy.sections.length > 0 ? (
        <Grid min={300}>
          {copy.sections.map((s) => (
            <Card key={s.heading} title={s.heading}>
              {s.body}
            </Card>
          ))}
        </Grid>
      ) : null}
      {children}
    </Page>
  );
}

export const colors = { INK, PAPER, LINE, MUTED, ACCENT };

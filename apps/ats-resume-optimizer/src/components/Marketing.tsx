import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The public shell.
 *
 * Marketing pages sit outside the signed-in app chrome — there is no sidebar
 * to show someone who has no records yet — so they share this frame instead.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="marketing">
      <header className="marketing-bar">
        <Link href="/welcome" className="brand-name">
          ATS Resume Optimizer
        </Link>
        <nav className="marketing-nav">
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>
      <main className="marketing-main">{children}</main>
      <footer className="marketing-foot">
        <p className="small muted">
          <Link href="/privacy">Privacy</Link> ·{" "}
          <Link href="/data-handling">Your data</Link> ·{" "}
          <Link href="/pricing">Pricing</Link> · <Link href="/login">Sign in</Link>
        </p>
        <p className="small muted" style={{ marginTop: 10 }}>
          The internal optimization score is our own measure of how well a resume lines
          up with a posting. It is <strong>not an employer&rsquo;s ATS score</strong>,
          and it does not guarantee interviews or hiring outcomes.
        </p>
      </footer>
    </div>
  );
}

export function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <section className="marketing-section">
      <h2>{title}</h2>
      {lede === undefined ? null : <p className="marketing-lede">{lede}</p>}
      {children}
    </section>
  );
}

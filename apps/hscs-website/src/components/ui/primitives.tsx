import Link from "next/link";
import type { ReactNode } from "react";
import { COMING_SOON, type Cta, type NavItem } from "@/lib/content";

// Small presentational primitives that apply the Design System token classes
// defined in globals.css. They hold no values of their own — the standard lives
// in the stylesheet.

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "md" | "lg" | "sm";

function classes(variant: ButtonVariant, size: ButtonSize): string {
  const parts = ["btn", `btn--${variant}`];
  if (size !== "md") parts.push(`btn--${size}`);
  return parts.join(" ");
}

/** Resolve a nav/footer link's effective destination: pending pages that are
 * not built yet route to the honest coming-soon page. */
export function effectiveHref(item: Pick<NavItem, "href" | "status">): string {
  return item.status === "pending" ? COMING_SOON : item.href;
}

export function Container({ children }: { children: ReactNode }) {
  return <div className="container">{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={classes(variant, size)}>
      {children}
    </Link>
  );
}

/** The single primary conversion, styled consistently everywhere it appears. */
export function PrimaryCta({ cta, size = "lg" }: { cta: Cta; size?: ButtonSize }) {
  return (
    <ButtonLink href={cta.href} variant="primary" size={size}>
      {cta.label}
    </ButtonLink>
  );
}

/** A secondary CTA. On-page anchors resolve now; page destinations that are not
 * built yet carry a title cue and land on the honest coming-soon page. */
export function SecondaryCta({ cta }: { cta: Cta }) {
  const pending = !cta.onPage && cta.href === COMING_SOON;
  return (
    <Link
      href={cta.href}
      className="btn btn--ghost"
      title={pending ? "This section is being prepared" : undefined}
    >
      {cta.label}
      {pending ? <span className="visually-hidden"> (being prepared)</span> : null}
      <span aria-hidden="true"> →</span>
    </Link>
  );
}

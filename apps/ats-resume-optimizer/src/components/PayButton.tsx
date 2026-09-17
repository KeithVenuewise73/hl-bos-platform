"use client";

/**
 * The checkout button.
 *
 * Client-side only so the click can be counted before the browser leaves for
 * Stripe — `payment_clicked` is the one funnel step we cannot recover later,
 * because everything after it happens on someone else's domain.
 *
 * The counter is fire-and-forget. If it fails, the navigation still happens:
 * losing an analytics row is acceptable, blocking a payment is not.
 */
export function PayButton({
  href,
  audience,
  label,
}: {
  href: string | undefined;
  audience: "consumer" | "coach";
  label: string;
}) {
  if (href === undefined) {
    return (
      <p className="notice notice-warn small">
        Checkout for this offer is not switched on in this installation yet. Email us
        and we will invoice you directly.
      </p>
    );
  }

  function count() {
    // keepalive: the page is navigating away as this fires.
    try {
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "payment_clicked", props: { audience } }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* never block checkout */
    }
  }

  return (
    <a
      className="btn btn-primary"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      onClick={count}
    >
      {label}
    </a>
  );
}

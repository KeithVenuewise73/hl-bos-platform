import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Request received",
  description: "Your HSCS Operations Assessment request has been received.",
  // A conversion confirmation has no business in search results.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The exact shape the database mints. Nothing else is shown as a reference. */
const REFERENCE_RE = /^HSCS-OA-[0-9A-F]{8}$/;

/**
 * The post-conversion confirmation (Page Specifications §4.10).
 *
 * It states a reference ONLY when the query string carries one in the exact
 * shape `submit_operations_assessment_request` returns. Anything else — a
 * hand-typed URL, a stale link, a bookmark — gets the page without a fabricated
 * reference, because a confirmation number that confirms nothing is the worst
 * kind of invented data: the visitor would quote it back to us.
 */
export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params["ref"];
  const candidate = typeof raw === "string" ? raw : "";
  const reference = REFERENCE_RE.test(candidate) ? candidate : null;

  return (
    <section className="section" aria-labelledby="ty-h">
      <Container>
        <Eyebrow>Operations Assessment</Eyebrow>
        <h1 id="ty-h" className="h1">
          {reference ? "Your request is in." : "Thank you."}
        </h1>

        {reference ? (
          <>
            <p className="body-l measure stack">
              It is stored and an operator will pick it up. Your reference is:
            </p>
            <p className="stack">
              <span className="reference">{reference}</span>
            </p>
            <p className="body measure stack">
              Keep it if you like — quoting it back to us finds your request
              immediately.
            </p>
          </>
        ) : (
          <p className="body-l measure stack">
            This page confirms an assessment request. We can&rsquo;t show a reference
            for this visit, which usually means you arrived here directly rather than
            from the form. If you were sending a request and didn&rsquo;t see a
            reference, it was not stored — please{" "}
            <Link href="/request-an-assessment">send it again</Link>.
          </p>
        )}

        <h2 className="h3 stack">While you wait</h2>
        <p className="body measure">
          <Link href="/services/operations-assessment">
            What the Operations Assessment actually covers
          </Link>{" "}
          — the domains it scores and what you get at the end.
        </p>
        <p className="body measure stack">
          <Link href="/industries">The operations we have run ourselves</Link> — five
          industry pages, written by the operator who ran them.
        </p>
      </Container>
    </section>
  );
}

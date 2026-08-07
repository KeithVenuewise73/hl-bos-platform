import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui/primitives";
import { WHAT_YOU_GET } from "@/lib/content";

export const metadata: Metadata = {
  title: "Request an Operations Assessment",
  description:
    "The HSCS Operations Assessment request is being prepared. Here's what the assessment delivers.",
};

// Honest temporary destination for the primary CTA (CTA rule, Milestone 2A).
// The assessment intake workflow is NOT built yet. This page says so plainly and
// does not present a form or a fabricated success state. No contact channel is
// invented here because none has been approved yet — when an approved intake
// exists, it replaces this page.
export default function RequestAssessmentPage() {
  return (
    <section className="section" aria-labelledby="ra-h">
      <Container>
        <Eyebrow>Operations Assessment</Eyebrow>
        <h1 id="ra-h" className="h1">
          The assessment request is being prepared.
        </h1>
        <p className="body-l measure stack">
          We're building the intake for the Operations Assessment now. It isn't live
          yet, so rather than show you a form that doesn't work, we're telling you
          straight: the request capability is being finalized and will be available here
          shortly.
        </p>
        <p className="body measure stack">
          When it's ready, requesting an assessment will be the first step — a
          conversation, not a commitment. Until then, here is exactly what the
          assessment delivers, so you know what you'll be asking for.
        </p>

        <div className="card stack">
          <p className="label">What you get</p>
          <ul className="whatyouget__list stack">
            {WHAT_YOU_GET.items.map((item) => (
              <li key={item} className="body">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="stack">
          <Link href="/" className="btn btn--outline">
            Back to the homepage
          </Link>
        </p>
      </Container>
    </section>
  );
}

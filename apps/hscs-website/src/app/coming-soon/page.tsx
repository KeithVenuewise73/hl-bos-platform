import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, PrimaryCta } from "@/components/ui/primitives";
import { PRIMARY_CTA } from "@/lib/content";

export const metadata: Metadata = {
  title: "Being prepared",
  description: "This section of the HSCS site is being prepared.",
};

// Honest destination for links whose page is not built yet (Milestone 2A covers
// the homepage only). It states plainly that the section is being prepared and
// routes the visitor back to what already works. No fabricated content.
export default function ComingSoonPage() {
  return (
    <section className="section" aria-labelledby="cs-h">
      <Container>
        <Eyebrow>Being prepared</Eyebrow>
        <h1 id="cs-h" className="h1">
          This part of the site is being prepared.
        </h1>
        <p className="body-l measure stack">
          We're rolling the HSCS site out in stages. This section isn't published yet —
          we'd rather tell you that than show you a half-finished page. The homepage is
          live now, and more is on the way.
        </p>
        <div className="hero__actions">
          <Link href="/" className="btn btn--secondary">
            Back to the homepage
          </Link>
          <PrimaryCta cta={PRIMARY_CTA} size="md" />
        </div>
      </Container>
    </section>
  );
}

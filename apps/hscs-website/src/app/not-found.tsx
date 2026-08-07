import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui/primitives";

// Honest 404 for genuinely unknown URLs. On-brand, not a dead end.
export default function NotFound() {
  return (
    <section className="section" aria-labelledby="nf-h">
      <Container>
        <Eyebrow>Page not found</Eyebrow>
        <h1 id="nf-h" className="h1">
          We couldn&apos;t find that page.
        </h1>
        <p className="body-l measure stack">
          The page you were looking for isn&apos;t here. It may have moved, or it may be
          part of the site we haven&apos;t published yet.
        </p>
        <p className="stack">
          <Link href="/" className="btn btn--secondary">
            Back to the homepage
          </Link>
        </p>
      </Container>
    </section>
  );
}

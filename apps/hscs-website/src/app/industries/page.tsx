import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, PrimaryCta } from "@/components/ui/primitives";
import { INDUSTRIES, INDUSTRIES_HUB } from "@/lib/industries";

export const metadata: Metadata = {
  title: INDUSTRIES_HUB.seoTitle,
  description: INDUSTRIES_HUB.seoDescription,
};

// Industries hub (T-Hub, §4.3). Lists the five approved verticals in supply-chain
// (lifecycle) order, ties them to the end-to-end operating record, and routes to
// the single primary CTA — Request an Operations Assessment.
export default function IndustriesHubPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Container>
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li aria-current="page">Industries</li>
          </ol>
        </Container>
      </nav>

      <section className="section hero" aria-labelledby="ind-hub-h">
        <Container>
          <Eyebrow>{INDUSTRIES_HUB.eyebrow}</Eyebrow>
          <h1 id="ind-hub-h" className="h1 hero__headline">
            {INDUSTRIES_HUB.headline}
          </h1>
          <p className="body-l measure hero__supporting">{INDUSTRIES_HUB.lede}</p>
          <div className="hero__actions">
            <PrimaryCta cta={INDUSTRIES_HUB.primaryCta} />
            <Link
              href={INDUSTRIES_HUB.lifecycleHref}
              className="btn btn--ghost"
              title="This section is being prepared"
            >
              See the full operating lifecycle<span aria-hidden="true"> →</span>
            </Link>
          </div>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="ind-hub-list-h">
        <Container>
          <h2 id="ind-hub-list-h" className="h2">
            Find your vertical
          </h2>
          <ul className="grid grid--2 grid--3 services-grid">
            {INDUSTRIES.map((i) => (
              <li key={i.slug} className="card service-card">
                <h3 className="h4 card__title">
                  <Link href={`/industries/${i.slug}`}>{i.name}</Link>
                </h3>
                <p className="body-s muted">{i.lede}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section section--navy" aria-labelledby="ind-hub-cta-h">
        <Container>
          <h2 id="ind-hub-cta-h" className="h1">
            Your operation is the one that matters.
          </h2>
          <p className="body-l measure stack">
            Wherever your operation sits in the chain, start with an Operations
            Assessment. We&apos;ll tell you — with evidence — where it&apos;s losing
            money and what to fix first.
          </p>
          <div className="hero__actions">
            <PrimaryCta cta={INDUSTRIES_HUB.primaryCta} />
          </div>
        </Container>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, PrimaryCta } from "@/components/ui/primitives";
import { SERVICES, SERVICES_HUB } from "@/lib/services";

export const metadata: Metadata = {
  title: SERVICES_HUB.seoTitle,
  description: SERVICES_HUB.seoDescription,
};

// Services hub (T-Hub). Lists every approved service, highlights the Operations
// Assessment as the "start here" front door, and routes to the primary CTA.
export default function ServicesHubPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Container>
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li aria-current="page">Services</li>
          </ol>
        </Container>
      </nav>

      <section className="section hero" aria-labelledby="hub-h">
        <Container>
          <Eyebrow>{SERVICES_HUB.eyebrow}</Eyebrow>
          <h1 id="hub-h" className="h1 hero__headline">
            {SERVICES_HUB.headline}
          </h1>
          <p className="body-l measure hero__supporting">{SERVICES_HUB.lede}</p>
          <div className="hero__actions">
            <PrimaryCta cta={SERVICES_HUB.primaryCta} />
            <Link href={SERVICES_HUB.startHereHref} className="btn btn--ghost">
              Start with an Operations Assessment<span aria-hidden="true"> →</span>
            </Link>
          </div>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="hub-list-h">
        <Container>
          <h2 id="hub-list-h" className="h2">
            The service ladder
          </h2>
          <ul className="grid grid--2 grid--3 services-grid">
            {SERVICES.map((s) => (
              <li
                key={s.slug}
                className={`card service-card${s.startHere ? " service-card--start" : ""}`}
              >
                {s.startHere ? <span className="tag">Start here</span> : null}
                {s.practiceArea ? <span className="tag">Practice area</span> : null}
                <h3 className="h4 card__title">
                  <Link href={`/services/${s.slug}`}>{s.name}</Link>
                </h3>
                <p className="body-s muted">{s.lede}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section section--navy" aria-labelledby="hub-cta-h">
        <Container>
          <h2 id="hub-cta-h" className="h1">
            Not sure which one you need?
          </h2>
          <p className="body-l measure stack">
            Start with an Operations Assessment. We&apos;ll tell you — with evidence —
            where your operation is losing money and what to fix first.
          </p>
          <div className="hero__actions">
            <PrimaryCta cta={SERVICES_HUB.primaryCta} />
          </div>
        </Container>
      </section>
    </>
  );
}

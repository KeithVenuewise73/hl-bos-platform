import Link from "next/link";
import {
  Container,
  Eyebrow,
  PrimaryCta,
  SecondaryCta,
} from "@/components/ui/primitives";
import { PRIMARY_CTA, COMING_SOON } from "@/lib/content";
import { SERVICES_BASE, type ServicePage } from "@/lib/services";

// Renders one approved service page against the T-Service section pattern
// (Website Page Specifications §3): hero → problem → scope → method → experience
// → related industries → what you get → FAQ → conversion band. Server component.
export function ServicePageView({ service }: { service: ServicePage }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Container>
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href={SERVICES_BASE}>Services</Link>
            </li>
            <li aria-current="page">{service.name}</li>
          </ol>
        </Container>
      </nav>

      <section className="section hero" aria-labelledby="svc-hero-h">
        <Container>
          <Eyebrow>{service.eyebrow}</Eyebrow>
          <h1 id="svc-hero-h" className="h1 hero__headline">
            {service.headline}
          </h1>
          <p className="body-l measure hero__supporting">{service.lede}</p>
          <div className="hero__actions">
            <PrimaryCta cta={PRIMARY_CTA} />
            <SecondaryCta cta={service.secondaryCta} />
          </div>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="svc-problem-h">
        <Container>
          <h2 id="svc-problem-h" className="h2">
            The problem this solves
          </h2>
          <p className="body-l measure stack">{service.problem}</p>
        </Container>
      </section>

      <section className="section" aria-labelledby="svc-scope-h">
        <Container>
          <h2 id="svc-scope-h" className="h2">
            What the engagement covers
          </h2>
          <ul className="whatyouget__list stack">
            {service.scope.map((item) => (
              <li key={item} className="body">
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="svc-method-h">
        <Container>
          <h2 id="svc-method-h" className="h2">
            How we work
          </h2>
          <p className="body-l measure stack">
            We work in four stages — Assess, Analyze, Recommend, Transform — and show
            our reasoning at every one. Every recommendation traces to a rating, a
            measurement, or a stated assumption, labelled fact, inference, or opinion.
            Where we don&apos;t know something, we say so and go measure it.
          </p>
          <Link
            href={COMING_SOON}
            className="btn btn--ghost"
            title="This section is being prepared"
          >
            See how we work<span aria-hidden="true"> →</span>
          </Link>
        </Container>
      </section>

      <section className="section" aria-labelledby="svc-exp-h">
        <Container>
          <h2 id="svc-exp-h" className="h2">
            The experience behind it
          </h2>
          <p className="body-l measure stack">{service.experience}</p>
        </Container>
      </section>

      {service.toolsNote ? (
        <section className="section section--mist" aria-labelledby="svc-tools-h">
          <Container>
            <h2 id="svc-tools-h" className="h2">
              Tools that can support the work
            </h2>
            <div className="card honesty">
              <p className="label">Supports consulting — not a product</p>
              <p className="body">{service.toolsNote}</p>
            </div>
          </Container>
        </section>
      ) : null}

      <section className="section" aria-labelledby="svc-ind-h">
        <Container>
          <h2 id="svc-ind-h" className="h2">
            Related industries
          </h2>
          <ul className="who__industries stack">
            {service.relatedIndustries.map((ri) => (
              <li key={ri.label}>
                <Link
                  href={ri.href}
                  className="chip"
                  title="This section is being prepared"
                >
                  {ri.label}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="svc-get-h">
        <Container>
          <h2 id="svc-get-h" className="h2">
            What you get
          </h2>
          <ul className="whatyouget__list stack">
            {service.whatYouGet.map((item) => (
              <li key={item} className="body">
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {service.faq.length > 0 ? (
        <section className="section" aria-labelledby="svc-faq-h">
          <Container>
            <h2 id="svc-faq-h" className="h2">
              Questions operators ask
            </h2>
            <div className="faq stack">
              {service.faq.map((f) => (
                <div key={f.q} className="card faq__item">
                  <h3 className="h4 card__title">{f.q}</h3>
                  <p className="body-s">{f.a}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      <section className="section section--navy" aria-labelledby="svc-cta-h">
        <Container>
          <h2 id="svc-cta-h" className="h1">
            Ready to find where your operation is losing money?
          </h2>
          <p className="body-l measure stack">
            Start with an Operations Assessment — the first step, not a commitment to a
            program. You&apos;ll walk away with something you can use whether we work
            together or not.
          </p>
          <div className="hero__actions">
            <PrimaryCta cta={PRIMARY_CTA} />
          </div>
        </Container>
      </section>
    </>
  );
}

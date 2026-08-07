import Link from "next/link";
import {
  Container,
  Eyebrow,
  PrimaryCta,
  SecondaryCta,
} from "@/components/ui/primitives";
import { PRIMARY_CTA } from "@/lib/content";
import { INDUSTRIES_BASE, LIFECYCLE_HREF, type IndustryPage } from "@/lib/industries";

// Renders one approved industry page against the T-Industry section pattern
// (Website Page Specifications §3): hero → operating proof → lifecycle placement
// → operational challenges → mapped services (the §6.2 bridge) → what you get →
// FAQ → conversion band. Server component.
export function IndustryPageView({ industry }: { industry: IndustryPage }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Container>
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href={INDUSTRIES_BASE}>Industries</Link>
            </li>
            <li aria-current="page">{industry.name}</li>
          </ol>
        </Container>
      </nav>

      <section className="section hero" aria-labelledby="ind-hero-h">
        <Container>
          <Eyebrow>{industry.eyebrow}</Eyebrow>
          <h1 id="ind-hero-h" className="h1 hero__headline">
            {industry.headline}
          </h1>
          <p className="body-l measure hero__supporting">{industry.lede}</p>
          <div className="hero__actions">
            <PrimaryCta cta={PRIMARY_CTA} />
            <SecondaryCta cta={industry.secondaryCta} />
          </div>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="ind-proof-h">
        <Container>
          <h2 id="ind-proof-h" className="h2">
            The operating proof
          </h2>
          <p className="body-l measure stack">{industry.operatingProof}</p>
          <div className="card honesty">
            <p className="label">Experience, not endorsement</p>
            <p className="body">
              Company names are withheld until permission is cleared. We describe the
              operating record honestly and never present it as a customer testimonial,
              case study, or endorsement.
            </p>
          </div>
        </Container>
      </section>

      <section className="section" aria-labelledby="ind-lifecycle-h">
        <Container>
          <h2 id="ind-lifecycle-h" className="h2">
            Where this sits in the chain
          </h2>
          <p className="body-l measure stack">{industry.lifecyclePlacement}</p>
          <Link
            href={LIFECYCLE_HREF}
            className="btn btn--ghost"
            title="This section is being prepared"
          >
            See the full operating lifecycle<span aria-hidden="true"> →</span>
          </Link>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="ind-challenges-h">
        <Container>
          <h2 id="ind-challenges-h" className="h2">
            The operational challenges we address here
          </h2>
          <ul className="whatyouget__list stack">
            {industry.challenges.map((item) => (
              <li key={item} className="body">
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section" aria-labelledby="ind-services-h">
        <Container>
          <h2 id="ind-services-h" className="h2">
            The services that prove out here
          </h2>
          <ul className="who__industries stack">
            {industry.mappedServices.map((svc) => (
              <li key={svc.href}>
                <Link href={svc.href} className="chip">
                  {svc.label}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="ind-get-h">
        <Container>
          <h2 id="ind-get-h" className="h2">
            What you get
          </h2>
          <ul className="whatyouget__list stack">
            {industry.whatYouGet.map((item) => (
              <li key={item} className="body">
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {industry.faq.length > 0 ? (
        <section className="section" aria-labelledby="ind-faq-h">
          <Container>
            <h2 id="ind-faq-h" className="h2">
              Questions operators ask
            </h2>
            <div className="faq stack">
              {industry.faq.map((f) => (
                <div key={f.q} className="card faq__item">
                  <h3 className="h4 card__title">{f.q}</h3>
                  <p className="body-s">{f.a}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      <section className="section section--navy" aria-labelledby="ind-cta-h">
        <Container>
          <h2 id="ind-cta-h" className="h1">
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

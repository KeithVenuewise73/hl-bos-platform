import {
  HERO,
  CREDIBILITY,
  LIFECYCLE,
  WHY,
  SERVICES,
  METHOD,
  AI_CLARIFIER,
  TOOLBOX,
  WHO_WE_HELP,
  WHAT_YOU_GET,
  CLOSING,
} from "@/lib/content";
import {
  Container,
  Eyebrow,
  PrimaryCta,
  SecondaryCta,
} from "@/components/ui/primitives";

// The homepage sections S1–S11, each rendering copy transcribed verbatim from
// the approved Homepage Copy v1.0 via the content model. Section order and ids
// follow the approved Homepage Content Architecture (S0 header / S12 footer live
// in the layout). Every section is a landmark with an accessible name.

export function Hero() {
  return (
    <section id={HERO.id} className="section hero" aria-labelledby="hero-h">
      <Container>
        <Eyebrow>{HERO.eyebrow}</Eyebrow>
        <h1 id="hero-h" className="display-xl hero__headline">
          {HERO.headline}
        </h1>
        <p className="body-l measure hero__supporting">{HERO.supporting}</p>
        <div className="hero__actions">
          <PrimaryCta cta={HERO.primaryCta} />
          <SecondaryCta cta={HERO.secondaryCta} />
        </div>
      </Container>
    </section>
  );
}

export function CredibilityStrip() {
  return (
    <section
      id={CREDIBILITY.id}
      className="section section--mist"
      aria-labelledby="cred-h"
    >
      <Container>
        <h2 id="cred-h" className="h2">
          {CREDIBILITY.headline}
        </h2>
        <p className="body-l measure stack">{CREDIBILITY.body}</p>
        <p className="label operating-record">{CREDIBILITY.operatingRecord}</p>
        <SecondaryCta cta={CREDIBILITY.secondaryCta} />
      </Container>
    </section>
  );
}

export function Lifecycle() {
  return (
    <section id={LIFECYCLE.id} className="section" aria-labelledby="life-h">
      <Container>
        <h2 id="life-h" className="h2">
          {LIFECYCLE.headline}
        </h2>
        <p className="body-l measure lifecycle__intro">{LIFECYCLE.body}</p>
        <ol className="lifecycle__chain">
          {LIFECYCLE.stages.map((stage, i) => (
            <li key={stage.name} className="stage">
              <span className="stage__index label" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="h4 stage__name">{stage.name}</h3>
              <p className="body-s muted">{stage.blurb}</p>
            </li>
          ))}
        </ol>
        <SecondaryCta cta={LIFECYCLE.secondaryCta} />
      </Container>
    </section>
  );
}

export function WhyHscs() {
  return (
    <section id={WHY.id} className="section section--mist" aria-labelledby="why-h">
      <Container>
        <h2 id="why-h" className="h2">
          {WHY.headline}
        </h2>
        <p className="body-l measure stack">{WHY.body}</p>
        <ul className="why__contrasts">
          {WHY.contrasts.map((c) => (
            <li key={c.them} className="contrast-row card">
              <span className="body-s muted">{c.them}</span>
              <span className="h4">{c.us}</span>
            </li>
          ))}
        </ul>
        <SecondaryCta cta={WHY.secondaryCta} />
      </Container>
    </section>
  );
}

export function ServiceLadder() {
  return (
    <section id={SERVICES.id} className="section" aria-labelledby="svc-h">
      <Container>
        <h2 id="svc-h" className="h2">
          {SERVICES.headline}
        </h2>
        <p className="body-l measure stack">{SERVICES.body}</p>
        <ul className="grid grid--2 grid--3 services-grid">
          {SERVICES.services.map((s) => (
            <li
              key={s.name}
              className={`card service-card${s.startHere ? " service-card--start" : ""}`}
            >
              {s.startHere ? <span className="tag">Start here</span> : null}
              <h3 className="h4 card__title">{s.name}</h3>
              <p className="body-s muted">{s.blurb}</p>
            </li>
          ))}
        </ul>
        <SecondaryCta cta={SERVICES.secondaryCta} />
      </Container>
    </section>
  );
}

export function MethodSection() {
  return (
    <section
      id={METHOD.id}
      className="section section--mist"
      aria-labelledby="method-h"
    >
      <Container>
        <h2 id="method-h" className="h2">
          {METHOD.headline}
        </h2>
        <p className="body-l measure stack">{METHOD.body}</p>
        <ol className="method__steps">
          {METHOD.steps.map((step, i) => (
            <li key={step} className="step">
              <span className="step__index label" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="h4">{step}</span>
            </li>
          ))}
        </ol>
        <div className="card honesty">
          <p className="label">The honesty guarantee</p>
          <p className="body">{METHOD.honestyGuarantee}</p>
        </div>
        <SecondaryCta cta={METHOD.secondaryCta} />
      </Container>
    </section>
  );
}

export function AiClarifier() {
  return (
    <section id={AI_CLARIFIER.id} className="section" aria-labelledby="ai-h">
      <Container>
        <h2 id="ai-h" className="h2">
          {AI_CLARIFIER.headline}
        </h2>
        <p className="body-l measure stack">{AI_CLARIFIER.body}</p>
        <ul className="grid grid--2 ai__grid">
          {AI_CLARIFIER.enhances.map((e) => (
            <li key={e.term} className="enhance">
              <span className="h4">{e.term}</span>
              <span className="body-s muted"> — {e.blurb}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function Toolbox() {
  return (
    <section id={TOOLBOX.id} className="section section--mist" aria-labelledby="tool-h">
      <Container>
        <h2 id="tool-h" className="h2">
          {TOOLBOX.headline}
        </h2>
        <p className="body-l measure stack">{TOOLBOX.body}</p>
        <ul className="grid grid--2 grid--3 toolbox__grid">
          {TOOLBOX.tools.map((t) => (
            <li key={t.name} className="card tool">
              <span className="tag tool__tag">{TOOLBOX.supportsTag}</span>
              <h3 className="h4 card__title">{t.name}</h3>
              <p className="body-s muted">{t.role}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function WhoWeHelp() {
  return (
    <section id={WHO_WE_HELP.id} className="section" aria-labelledby="who-h">
      <Container>
        <h2 id="who-h" className="h2">
          {WHO_WE_HELP.headline}
        </h2>
        <p className="body-l measure stack">{WHO_WE_HELP.body}</p>
        <p className="label who__label">Roles we serve</p>
        <ul className="who__roles">
          {WHO_WE_HELP.roles.map((r) => (
            <li key={r} className="chip">
              {r}
            </li>
          ))}
        </ul>
        <p className="label who__label">Industries</p>
        <ul className="who__industries">
          {WHO_WE_HELP.industries.map((ind) => (
            <li key={ind} className="chip">
              {ind}
            </li>
          ))}
        </ul>
        <SecondaryCta cta={WHO_WE_HELP.secondaryCta} />
      </Container>
    </section>
  );
}

export function WhatYouGet() {
  return (
    <section
      id={WHAT_YOU_GET.id}
      className="section section--mist"
      aria-labelledby="wyg-h"
    >
      <Container>
        <h2 id="wyg-h" className="h2">
          {WHAT_YOU_GET.headline}
        </h2>
        <p className="body-l measure stack">{WHAT_YOU_GET.body}</p>
        <ul className="whatyouget__list stack">
          {WHAT_YOU_GET.items.map((item) => (
            <li key={item} className="body">
              {item}
            </li>
          ))}
        </ul>
        <SecondaryCta cta={WHAT_YOU_GET.secondaryCta} />
      </Container>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section
      id={CLOSING.id}
      className="section section--navy"
      aria-labelledby="close-h"
    >
      <Container>
        <h2 id="close-h" className="h1">
          {CLOSING.headline}
        </h2>
        <p className="body-l measure stack">{CLOSING.body}</p>
        <div className="hero__actions">
          <PrimaryCta cta={CLOSING.primaryCta} />
          <SecondaryCta cta={CLOSING.secondaryCta} />
        </div>
        <p className="body-s closing__microcopy">{CLOSING.microcopy}</p>
      </Container>
    </section>
  );
}

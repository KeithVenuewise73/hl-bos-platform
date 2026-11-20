import type { ReactNode } from "react";
import {
  displayPhone,
  isSafeHref,
  resolveCta,
  smsHref,
  telHref,
  type Page,
  type Section,
  type SiteSpec,
} from "@hl-bos/sitegen-spec";
import { DAY_NAMES, formatPrice, formatTime, sortHours } from "./format.ts";
import type { RenderContext } from "./types.ts";
import { safeAssetUrl } from "./url.ts";

interface Env {
  spec: SiteSpec;
  ctx: RenderContext;
}

const paragraphs = (s: string): string[] =>
  s.split(/\n+/).filter((l) => l.trim() !== "");

function Buttons({ spec, where }: { spec: SiteSpec; where: "hero" | "contact" }) {
  const { phone, bookingUrl } = spec.profile;
  const cta = resolveCta(spec);
  const call = (
    <a className="btn s" href={telHref(phone)}>
      Call {displayPhone(phone)}
    </a>
  );
  const text = (
    <a className="btn s" href={smsHref(phone)}>
      Text us
    </a>
  );
  const book =
    bookingUrl && isSafeHref(bookingUrl) ? (
      <a className="btn p" href={bookingUrl} rel="noopener">
        Book now
      </a>
    ) : null;
  // The primary button follows the spec's CTA. Without a booking link that is Call.
  const primaryIsBook = cta === "book" && book !== null;
  if (where === "hero") {
    return (
      <div className="btns">
        {primaryIsBook ? (
          book
        ) : (
          <a className="btn p" href={telHref(phone)}>
            Call {displayPhone(phone)}
          </a>
        )}
        {primaryIsBook ? call : text}
      </div>
    );
  }
  return (
    <div className="btns">
      {primaryIsBook ? (
        book
      ) : (
        <a className="btn p" href={telHref(phone)}>
          Call {displayPhone(phone)}
        </a>
      )}
      {primaryIsBook && call}
      {text}
    </div>
  );
}

function Hero({ spec, ctx }: Env) {
  const img = safeAssetUrl(ctx.assets?.heroUrl);
  return (
    <section className="hero">
      <div className="w">
        <h1>{spec.hero.headline}</h1>
        {spec.hero.subheadline !== "" && <p className="sub">{spec.hero.subheadline}</p>}
        <Buttons spec={spec} where="hero" />
      </div>
      {img && <img className="hero-img" src={img} alt="" fetchPriority="high" />}
    </section>
  );
}

function Services({
  spec,
  section,
}: {
  spec: SiteSpec;
  section: Extract<Section, { type: "services" }>;
}) {
  const services = spec.profile.services;
  if (services.length === 0) return null;
  const showPrices = section.showPrices !== false;
  return (
    <Block alt heading={section.heading ?? "Services"} id="services">
      {section.intro && <p className="muted">{section.intro}</p>}
      <ul className="list">
        {services.map((s, i) => {
          const extra = [
            showPrices && s.priceCents !== undefined ? formatPrice(s.priceCents) : null,
          ];
          return (
            <li key={i}>
              <span>
                {s.name}
                {s.durationMinutes !== undefined && (
                  <span className="muted"> &middot; {s.durationMinutes} min</span>
                )}
              </span>
              {extra[0] && <span className="price">{extra[0]}</span>}
              {s.description && <span className="d">{s.description}</span>}
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function Hours({
  spec,
  section,
}: {
  spec: SiteSpec;
  section: Extract<Section, { type: "hours" }>;
}) {
  if (spec.profile.hours.length === 0) return null;
  return (
    <Block heading={section.heading ?? "Hours"} id="hours">
      <table className="hours">
        <tbody>
          {sortHours(spec.profile.hours).map((h) => (
            <tr key={h.day}>
              <th scope="row">{DAY_NAMES[h.day]}</th>
              <td>
                {h.closed || !h.open || !h.close
                  ? "Closed"
                  : `${formatTime(h.open)} – ${formatTime(h.close)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Block>
  );
}

function Gallery({
  section,
  ctx,
}: {
  section: Extract<Section, { type: "gallery" }>;
  ctx: RenderContext;
}) {
  const items = section.items.flatMap((it) => {
    const src = safeAssetUrl(ctx.assets?.gallery?.[it.assetId]);
    return src ? [{ src, alt: it.alt }] : [];
  });
  if (items.length === 0) return null;
  return (
    <Block heading={section.heading ?? "Gallery"} id="gallery">
      <ul className="gal">
        {items.map((it, i) => (
          <li key={i}>
            <img src={it.src} alt={it.alt} loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Contact({
  spec,
  section,
}: {
  spec: SiteSpec;
  section: Extract<Section, { type: "contact" }>;
}) {
  const a = spec.profile.address;
  const line2 = a
    ? [a.city, [a.region, a.postalCode].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ")
    : "";
  const links = (section.links ?? []).filter((l) => isSafeHref(l.href));
  return (
    <Block alt heading={section.heading ?? "Contact"} id="contact" className="contact">
      {section.note && <p>{section.note}</p>}
      {a && (a.street || line2) && (
        <address>
          {a.street && (
            <>
              {a.street}
              <br />
            </>
          )}
          {line2}
        </address>
      )}
      <Buttons spec={spec} where="contact" />
      {links.length > 0 && (
        <ul className="list">
          {links.map((l, i) => (
            <li key={i}>
              <a
                href={l.href}
                rel={l.href.startsWith("https:") ? "noopener" : undefined}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function Block(props: {
  heading: string;
  id: string;
  alt?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`sec${props.alt ? " alt" : ""}${props.className ? ` ${props.className}` : ""}`}
      id={props.id}
    >
      <div className="w">
        <h2>{props.heading}</h2>
        {props.children}
      </div>
    </section>
  );
}

function SectionView({ section, env }: { section: Section; env: Env }) {
  switch (section.type) {
    case "hero":
      return <Hero {...env} />;
    case "services":
      return <Services spec={env.spec} section={section} />;
    case "hours":
      return <Hours spec={env.spec} section={section} />;
    case "about":
      return (
        <Block heading={section.heading ?? "About"} id="about">
          {paragraphs(section.body).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </Block>
      );
    case "gallery":
      return <Gallery section={section} ctx={env.ctx} />;
    case "contact":
      return <Contact spec={env.spec} section={section} />;
    case "faq":
      return (
        <Block heading={section.heading ?? "Questions"} id="faq">
          {section.items.map((q, i) => (
            <details key={i}>
              <summary>{q.question}</summary>
              {paragraphs(q.answer).map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </details>
          ))}
        </Block>
      );
  }
}

export function Body({
  spec,
  ctx,
  page,
  pages,
  pathOf,
}: {
  spec: SiteSpec;
  ctx: RenderContext;
  page: Page;
  pages: readonly Page[];
  pathOf: (p: Page) => string;
}) {
  const logo = safeAssetUrl(ctx.assets?.logoUrl);
  const p = spec.profile;
  const a = p.address;
  const addr = a
    ? [
        a.street,
        [a.city, [a.region, a.postalCode].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  return (
    <>
      <header className="hdr">
        <div className="w">
          <a className="brand" href={pathOf(pages[0] as Page)}>
            {logo && <img src={logo} alt="" />}
            <span>{p.businessName}</span>
          </a>
          {pages.length > 1 && (
            <nav className="nav" aria-label="Pages">
              {pages.map((pg) => (
                <a
                  key={pg.slug}
                  href={pathOf(pg)}
                  aria-current={pg === page ? "page" : undefined}
                >
                  {pg.title}
                </a>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main>
        {page.sections.map((s, i) => (
          <SectionView key={i} section={s} env={{ spec, ctx }} />
        ))}
      </main>
      <footer className="ftr">
        <div className="w">
          <p>{p.businessName}</p>
          {addr !== "" && <p>{addr}</p>}
          <p>
            <a href={telHref(p.phone)}>{displayPhone(p.phone)}</a>
          </p>
        </div>
      </footer>
    </>
  );
}

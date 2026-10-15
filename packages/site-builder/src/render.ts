// Draft -> one self-contained HTML page.
//
// Safety properties, each tested:
//   * every value from the lead or the copy is HTML-escaped;
//   * no <script> except the JSON-LD data block, whose JSON is escaped so it
//     cannot close the tag;
//   * <meta name="robots" content="noindex, nofollow"> and a demo banner that
//     says who made it and that it is not the business's official site;
//   * sample content carries a visible SAMPLE marker;
//   * the only rating shown is the real Google one, attributed to Google Maps,
//     with no review text; JSON-LD carries no rating at all;
//   * the contact form is inert (disabled fields, no action, no submit).

import { FONTS_HREF, siteCss } from "./design.ts";
import { renderProfessional } from "./render-professional.ts";
import type { SiteDraft } from "./types.ts";
import { verticalDef } from "./verticals.ts";

export { esc, initials, jsonLd, sampleTag } from "./html.ts";
import { esc, initials, jsonLd, sampleTag } from "./html.ts";

export function renderSite(draft: SiteDraft): string {
  if (verticalDef(draft.vertical).renderer === "professional")
    return renderProfessional(draft);
  const f = draft.facts;
  const c = draft.copy;
  const tel = f.phoneLink ? `tel:${f.phoneLink}` : undefined;
  const sms = f.phoneLink ? `sms:${f.phoneLink}` : undefined;
  const prepared = draft.updatedAt.slice(0, 10);
  const showRating = draft.options.showRating && f.rating !== undefined;
  const stars = f.rating ? "★".repeat(Math.round(f.rating.value)).padEnd(5, "☆") : "";
  const anySample = c.aboutSample || c.offerings.some((o) => o.sample);

  const heroButtons = [
    tel ? `<a class="btn btn-light" href="${esc(tel)}">Call ${esc(f.phone)}</a>` : "",
    sms ? `<a class="btn btn-outline-light" href="${esc(sms)}">Send a text</a>` : "",
    `<a class="btn btn-outline-light" href="#contact">${esc(verticalDef(draft.vertical).primaryCta)}</a>`,
  ].join("");

  const offerings = c.offerings
    .map(
      (o) =>
        `<article class="card"><div class="ico">${esc(initials(o.name))}</div><h3>${esc(o.name)}${sampleTag(o.sample)}</h3><p>${esc(o.description)}</p></article>`,
    )
    .join("");

  const reach = [
    f.phone && tel
      ? `<li><div class="k">Call</div><div class="v"><a href="${esc(tel)}">${esc(f.phone)}</a></div></li>`
      : "",
    sms
      ? `<li><div class="k">Text</div><div class="v"><a href="${esc(sms)}">Send a text message</a></div></li>`
      : "",
    f.email
      ? `<li><div class="k">Email</div><div class="v"><a href="mailto:${esc(f.email)}">${esc(f.email)}</a></div></li>`
      : "",
    f.address
      ? `<li><div class="k">Address</div><div class="v">${esc(f.address)}</div></li>`
      : "",
    f.directionsUrl
      ? `<li><div class="k">Directions</div><div class="v"><a href="${esc(f.directionsUrl)}" rel="noopener">Open in Google Maps</a></div></li>`
      : "",
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(c.seoTitle)}</title>
<meta name="description" content="${esc(c.metaDescription)}">
<meta property="og:title" content="${esc(c.seoTitle)}">
<meta property="og:description" content="${esc(c.metaDescription)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS_HREF}" rel="stylesheet">
<script type="application/ld+json">${jsonLd(draft)}</script>
<style>${siteCss(draft.vertical)}</style>
</head>
<body>
<div class="demo-banner" role="note"><strong>Demo website</strong> prepared by Herman Legacy Group for ${esc(f.businessName)} on ${esc(prepared)}. It is not ${esc(f.businessName)}&rsquo;s official website.${anySample ? " Items marked <strong>Sample</strong> are placeholders to be replaced with the business&rsquo;s own." : ""}</div>
<header class="site-header"><div class="wrap nav">
<a class="brand" href="#top"><span class="brand-mark">${esc(initials(f.businessName))}</span><span class="brand-name">${esc(f.businessName)}</span></a>
<ul class="nav-links"><li><a href="#offerings">${esc(c.offeringsHeading)}</a></li><li><a href="#about">About</a></li><li><a href="#visit">Visit</a></li><li><a href="#contact">Contact</a></li></ul>
</div></header>
<main id="top">
<section class="hero"><div class="wrap">
<p class="eyebrow">${esc(c.heroEyebrow)}</p>
<h1>${esc(c.heroHeadline)}</h1>
<p>${esc(c.heroSubhead)}</p>
<div class="btn-row">${heroButtons}</div>
${showRating && f.rating ? `<div class="rating"><span class="stars" aria-hidden="true">${stars}</span><span>${esc(f.rating.value.toFixed(1))} from ${esc(f.rating.count)} Google review${f.rating.count === 1 ? "" : "s"}</span><span class="src">Source: Google Maps</span></div>` : ""}
</div></section>
<section class="section" id="offerings"><div class="wrap">
<div class="section-head"><p class="eyebrow">${esc(c.offeringsHeading)}</p><h2>${esc(c.offeringsHeading)}</h2><p class="lede">${esc(c.offeringsIntro)}</p></div>
<div class="grid ${c.offerings.length % 3 === 0 ? "g-3" : "g-2"}">${offerings}</div>
</div></section>
<section class="section section-tint" id="about"><div class="wrap split">
<div><p class="eyebrow">About</p><h2>${esc(c.aboutHeading)}${sampleTag(c.aboutSample)}</h2><p class="lede">${esc(c.aboutBody)}</p></div>
<aside class="panel" id="visit"><h3>Reach ${esc(f.businessName)}</h3><ul class="info-list">${reach || "<li>Contact details to be added.</li>"}</ul></aside>
</div></section>
${draft.options.showVideoBlock ? `<section class="section"><div class="wrap"><div class="section-head"><p class="eyebrow">Video</p><h2>See ${esc(f.businessName)} in action</h2></div><div class="video">Optional: a short promo video of ${esc(f.businessName)}, filmed with the owner, goes here. Placeholder — no video has been made.</div></div></section>` : ""}
<section class="section" id="contact"><div class="wrap">
<div class="section-head"><p class="eyebrow">Contact</p><h2>${esc(c.ctaHeading)}</h2><p class="lede">${esc(c.ctaBody)}</p></div>
<div class="form-wrap"><form aria-label="Contact form (not active in this demo)">
<div class="form-grid">
<div class="field"><label for="n">Name</label><input id="n" disabled></div>
<div class="field"><label for="p">Phone</label><input id="p" disabled></div>
<div class="field full"><label for="m">How can we help?</label><textarea id="m" rows="4" disabled></textarea></div>
</div>
<p class="form-note">This form is switched off in the demo and goes live at launch.${tel ? ` For now, <a href="${esc(tel)}">call ${esc(f.phone)}</a>.` : ""}</p>
</form></div>
<div class="cta-band" style="margin-top:2.4rem"><h2>Reach ${esc(f.businessName)}</h2><div class="btn-row">${heroButtons}</div></div>
</div></section>
</main>
<footer class="site-footer"><div class="wrap">
<div><strong style="color:#fff">${esc(f.businessName)}</strong>${f.address ? ` · ${esc(f.address)}` : ""}${f.phone ? ` · ${esc(f.phone)}` : ""}</div>
<div class="foot-note">Demo prepared by Herman Legacy Group on ${esc(prepared)} for review by ${esc(f.businessName)}. Not affiliated with or endorsed by ${esc(f.businessName)} until approved by its owner.${showRating ? " Rating data: Google Maps." : ""}</div>
</div></footer>
</body>
</html>
`;
}

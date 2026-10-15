// Premium Business Site drafts: build, version, approve, export.
//
// A draft freezes its content when it is built, so an approved design never
// changes underneath the approval. Approval is internal sign-off on the
// design; it publishes nothing, and nothing in this package can publish.

import { zipStore, type ZipEntry } from "@hl-bos/jersey-sort";

import type { BusinessProfile } from "../profile.ts";
import type { ChecklistItem } from "../types.ts";
import { FORBIDDEN } from "../validate.ts";
import { premiumContent, type PremiumContent } from "./content.ts";
import { premiumCss } from "./css.ts";
import { PREMIUM_PAGES, renderPremiumSite } from "./render.ts";
import {
  accessibilityReview,
  completenessReport,
  performanceReview,
  type ReviewCheck,
} from "./review.ts";
import { premiumTheme, PREMIUM_THEMES } from "./themes.ts";

export class PremiumDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PremiumDraftError";
  }
}

export interface PremiumDraft {
  id: string;
  profileId: string;
  version: number;
  theme: string;
  content: PremiumContent;
  checklist: ChecklistItem[];
  status: "draft" | "approved";
  approved: { by: string; at: string } | undefined;
  createdAt: string;
  updatedAt: string;
  buildMs: number;
  audit: { at: string; by: string; action: string; detail: string }[];
}

/** Which product a profile's site is: the one-page Express Demo or a Premium Business Site. */
export type SiteProduct = "express_demo" | "premium_site";

export const SITE_PRODUCTS: Record<SiteProduct, { label: string; summary: string }> = {
  express_demo: {
    label: "Express Demo",
    summary:
      "One page, built in seconds from a lead, template copy, sample content marked. For first sales conversations.",
  },
  premium_site: {
    label: "Premium Business Site",
    summary:
      "Six pages, a distinct brand treatment, deeper content from a verified Business Profile. For HLG companies and paying clients.",
  },
};

// Claims the premium copy may never carry. Confirmed (verified) items may state
// approved experience and numbers; drafted items face every rule.
const ALWAYS = new Set([
  "a price or price claim",
  "a guarantee",
  "something offered free",
  "a superlative or award",
  "a credential",
  "a rating or review claim",
  "a link or email address",
]);

/** The claims check over every word the profile puts on the site. */
export function premiumClaimProblems(c: PremiumContent): string[] {
  const out: string[] = [];
  const check = (label: string, text: string, confirmed: boolean) => {
    for (const [re, what] of FORBIDDEN) {
      if (confirmed && !ALWAYS.has(what)) continue;
      const scrubbed = text.split(c.brand.name).join(" ");
      if (re.test(scrubbed))
        out.push(`${label} contains ${what}: "${text.slice(0, 60)}".`);
    }
  };
  check("The headline", c.brand.headline, true);
  if (c.brand.lede) check("The description", c.brand.lede, true);
  if (c.brand.credibility)
    check("The credibility statement", c.brand.credibility, true);
  check("The primary call to action", c.primaryCta, true);
  for (const [label, list] of [
    ["Service", c.services],
    ["Challenge", c.challenges],
    ["Process step", c.process],
    ["Industry", c.industries],
    ["Experience item", c.experience],
    ["Value pillar", c.pillars],
    ["Case study", c.caseStudies],
  ] as const)
    for (const i of list)
      check(
        `${label} "${i.name.slice(0, 40)}"`,
        `${i.name} ${i.description}`,
        i.confirmed,
      );
  for (const s of c.solutions)
    check(`Product "${s.name}"`, `${s.name} ${s.description}`, true);
  return out;
}

/** Launch readiness for a premium site: every fact, decision and review before publication. */
export function premiumReadiness(
  c: PremiumContent,
  reviewsOk: boolean,
): ChecklistItem[] {
  const items: ChecklistItem[] = c.missing.map((m, i) => ({
    id: `info-${i + 1}`,
    area: "Content",
    task: `Supply and verify: ${m}.`,
    why: "The site shows an Information required notice until it is verified.",
    owner: "CEO decision",
  }));
  const drafted = [
    ...c.services,
    ...c.challenges,
    ...c.process,
    ...c.industries,
  ].filter((i) => !i.confirmed).length;
  if (drafted)
    items.push({
      id: "confirm-drafted",
      area: "Verification",
      task: `Confirm or remove the ${drafted} item(s) marked To confirm.`,
      why: "Drafted content is flagged on every page until it is verified in the Business Profile.",
      owner: "CEO decision",
    });
  items.push(
    {
      id: "design-approval",
      area: "Content",
      task: "Approve the design, or ask for revisions.",
      why: "Approval here is internal sign-off on the design only.",
      owner: "CEO decision",
    },
    {
      id: "domain",
      area: "Domain",
      task: c.plannedDomain
        ? `Confirm ${c.plannedDomain} as the address, then configure DNS (a separate approval).`
        : "Choose the public domain or subdomain.",
      why: "No DNS has been configured.",
      owner: "CEO decision",
    },
    {
      id: "hosting",
      area: "Hosting",
      task: "Decide on hosting (private preview hosting first, if approved).",
      why: "Hosting is a paid, ongoing commitment.",
      owner: "CEO decision",
    },
    {
      id: "form",
      area: "Leads and CRM",
      task: "Decide where assessment requests go before the form is switched on.",
      why: "The form is disabled in the draft.",
      owner: "CEO decision",
    },
    {
      id: "privacy",
      area: "Legal",
      task: c.legal.length
        ? "Confirm the privacy policy covers the assessment form."
        : "Approve preparing a privacy policy; add its verified link to the profile.",
      why: "The site collects contact details once the form is on.",
      owner: "CEO decision",
    },
    {
      id: "reviews",
      area: "Measurement",
      task: reviewsOk
        ? "Re-run the accessibility and performance reviews after any change (they pass now)."
        : "Fix the failing accessibility or performance checks.",
      why: "Every published page must stay accessible and fast.",
      owner: "HLG",
    },
    {
      id: "publishing",
      area: "Publishing",
      task: "Approve publishing explicitly. Nothing has been published, and this tool cannot publish.",
      why: "Every public step needs CEO approval.",
      owner: "CEO decision",
    },
  );
  return items;
}

export interface PremiumSiteFiles {
  pages: Record<string, string>;
  css: string;
}

export function premiumFiles(d: PremiumDraft): PremiumSiteFiles {
  return {
    pages: renderPremiumSite(d.content, {
      version: d.version,
      prepared: d.updatedAt.slice(0, 10),
    }),
    css: premiumCss(premiumTheme(d.theme)),
  };
}

/** The draft's reviews, computed from what would ship. */
export function premiumReviews(
  d: PremiumDraft,
  fontBytes: number,
): { accessibility: ReviewCheck[]; performance: ReviewCheck[] } {
  const f = premiumFiles(d);
  return {
    accessibility: accessibilityReview(f.pages, f.css, d.content),
    performance: performanceReview(f.pages, f.css, fontBytes),
  };
}

export { completenessReport };

/** Build (or rebuild, as the next version) a premium site draft from a profile. */
export function buildPremiumDraft(
  profile: BusinessProfile,
  deps: {
    now: () => Date;
    newId: () => string;
    actor: string;
    previous: PremiumDraft | undefined;
  },
): PremiumDraft {
  const t0 = performance.now();
  let content: PremiumContent;
  try {
    content = premiumContent(profile);
  } catch (e) {
    throw new PremiumDraftError(e instanceof Error ? e.message : String(e));
  }
  const problems = premiumClaimProblems(content);
  if (problems.length)
    throw new PremiumDraftError(
      `The profile fails the claims check: ${problems.slice(0, 4).join(" ")}`,
    );
  const at = deps.now().toISOString();
  const version = (deps.previous?.version ?? 0) + 1;
  const draft: PremiumDraft = {
    id: deps.previous?.id ?? deps.newId(),
    profileId: profile.id,
    version,
    theme: content.theme,
    content,
    checklist: [],
    status: "draft",
    approved: undefined,
    createdAt: deps.previous?.createdAt ?? at,
    updatedAt: at,
    buildMs: 0,
    audit: [
      ...(deps.previous?.audit ?? []),
      {
        at,
        by: deps.actor,
        action: deps.previous ? "rebuilt" : "built",
        detail: `Version ${version}: ${PREMIUM_PAGES.length} pages, theme ${PREMIUM_THEMES[content.theme]?.label ?? content.theme}${content.missing.length ? `; ${content.missing.length} item(s) still required` : ""}.`,
      },
    ],
  };
  const r = premiumReviews(draft, FONT_BYTES_ESTIMATE);
  const ok = [...r.accessibility, ...r.performance].every((x) => x.ok);
  draft.checklist = premiumReadiness(content, ok);
  draft.buildMs = Math.round(performance.now() - t0);
  return draft;
}

/** Internal sign-off on the design. Publishes nothing. */
export function approvePremiumDraft(
  d: PremiumDraft,
  by: string,
  now: Date,
): PremiumDraft {
  if (d.status === "approved") return d;
  const at = now.toISOString();
  return {
    ...d,
    status: "approved",
    approved: { by, at },
    audit: [
      ...d.audit,
      {
        at,
        by,
        action: "approved",
        detail: "Design approved for internal review purposes. Nothing was published.",
      },
    ],
  };
}

// --- fonts and export --------------------------------------------------------

/** The bundled font files (SIL Open Font License 1.1), with their licences. */
export const FONT_FILES = [
  { file: "inter-latin-wght-normal.woff2", licence: "OFL-inter.txt" },
  { file: "fraunces-latin-wght-normal.woff2", licence: "OFL-fraunces.txt" },
  { file: "archivo-latin-wght-normal.woff2", licence: "OFL-archivo.txt" },
] as const;

/** Approximate bytes of the two fonts a page loads (checked exactly in tests). */
export const FONT_BYTES_ESTIMATE = 90 * 1024;

export function premiumZipName(d: PremiumDraft): string {
  const slug = d.content.brand.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `hlg-premium-draft-${slug}-v${d.version}.zip`;
}

export function premiumReadme(d: PremiumDraft): string {
  return [
    `PREMIUM SITE DRAFT — ${d.content.brand.name} (not published)`,
    "",
    `Version ${d.version}, prepared ${d.updatedAt.slice(0, 10)} from the verified Business Profile; ${d.status === "approved" ? `design approved by ${d.approved?.by} on ${d.approved?.at.slice(0, 10)} (internal sign-off only)` : "awaiting design review"}.`,
    "Do not publish without explicit CEO approval. Every page is marked noindex and carries an internal-draft banner and To confirm / Information required markers that must be resolved first.",
    d.content.plannedDomain
      ? `Planned address: ${d.content.plannedDomain} (not configured).`
      : "",
    "",
    `Pages: ${PREMIUM_PAGES.map((p) => p.file).join(", ")}.`,
    "assets/site.css; assets/fonts/ (SIL Open Font License 1.1; licences included). No scripts, no trackers, no remote requests.",
    "LAUNCH-READINESS.md lists what must happen before publication.",
    "",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

export function premiumReadinessMarkdown(d: PremiumDraft): string {
  return `${[
    `# Launch readiness — ${d.content.brand.name} (premium site)`,
    "",
    `Version ${d.version}, ${d.status}. Nothing on this list has been done.`,
    "",
    ...d.checklist.flatMap((i) => [
      `- [ ] **${i.area}** — ${i.task}`,
      `  - Why: ${i.why}`,
      `  - Owner: ${i.owner}`,
    ]),
  ].join("\n")}\n`;
}

/** The whole site as a ZIP: pages, stylesheet, the two fonts it uses, licences, readiness. */
export async function premiumZip(
  d: PremiumDraft,
  readAsset: (file: string) => Promise<Uint8Array>,
  now: Date,
): Promise<Uint8Array> {
  const t = premiumTheme(d.theme);
  const f = premiumFiles(d);
  const enc = new TextEncoder();
  const folder = premiumZipName(d).replace(/\.zip$/, "");
  const fonts = FONT_FILES.filter(
    (x) => x.file === t.display.file || x.file === t.body.file,
  );
  const entries: ZipEntry[] = [
    ...Object.entries(f.pages).map(([name, html]) => ({
      name: `${folder}/${name}`,
      data: enc.encode(html),
      modified: now,
    })),
    { name: `${folder}/assets/site.css`, data: enc.encode(f.css), modified: now },
    ...(await Promise.all(
      fonts.flatMap((x) => [
        readAsset(x.file).then((data) => ({
          name: `${folder}/assets/fonts/${x.file}`,
          data,
          modified: now,
        })),
        readAsset(x.licence).then((data) => ({
          name: `${folder}/assets/fonts/${x.licence}`,
          data,
          modified: now,
        })),
      ]),
    )),
    {
      name: `${folder}/LAUNCH-READINESS.md`,
      data: enc.encode(premiumReadinessMarkdown(d)),
      modified: now,
    },
    { name: `${folder}/README.txt`, data: enc.encode(premiumReadme(d)), modified: now },
  ];
  const parts: Uint8Array[] = [];
  for await (const chunk of zipStore(entries)) parts.push(chunk);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** For a preview route: is this a page or asset the site serves? */
export function premiumAsset(
  d: PremiumDraft,
  rel: string,
):
  | { kind: "page"; html: string }
  | { kind: "css"; css: string }
  | { kind: "font"; file: string }
  | undefined {
  if (rel === "" || rel === "/") rel = "index.html";
  const f = premiumFiles(d);
  const html = f.pages[rel];
  if (html !== undefined) return { kind: "page", html };
  if (rel === "assets/site.css") return { kind: "css", css: f.css };
  const font = /^assets\/fonts\/([a-z-]+\.woff2)$/.exec(rel)?.[1];
  if (font && FONT_FILES.some((x) => x.file === font))
    return { kind: "font", file: font };
  return undefined;
}

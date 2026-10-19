// Internal-draft mode: a private website draft for a business HLG owns, built
// from its verified Business Profile (profile.ts), with the Presence Scanner
// audit of its current presence feeding the launch-readiness checklist.
//
// Differences from a prospect demo, each tested:
//   * banner says "Internal draft — not published"; no "prepared by HLG" line;
//   * facts come from VERIFIED profile fields only; claim sections with nothing
//     verified show an "information required" notice;
//   * the checklist is a launch-readiness list: every missing fact, every
//     decision, and anything the audit found that must be fixed or verified;
//   * publishing is listed as a CEO decision -- nothing here can publish.

import { factsFromProspect } from "./facts.ts";
import {
  brandAccent,
  CLAIM_LISTS,
  profileMissing,
  profilePhone,
  verified,
  verifiedItems,
  type BusinessProfile,
  type ProfileItem,
  type ProfileListKey,
} from "./profile.ts";
import type { Prospect } from "@hl-bos/presence-scanner";
import { templateProCopy } from "./copy-template.ts";
import type {
  ChecklistItem,
  Offering,
  SiteCopy,
  SiteDraft,
  SiteFacts,
  ToolItem,
  VerifiableField,
} from "./types.ts";
import { LIMITS, validateCopy } from "./validate.ts";
import { proPackFor, sample, verticalDef } from "./verticals.ts";

export class InternalDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalDraftError";
  }
}

const fit = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

/** Facts for the page: verified profile fields only, plus the audit's gaps. */
export function factsFromProfile(
  p: BusinessProfile,
  prospect: Prospect | undefined,
): SiteFacts {
  const name = verified(p, "brandName") ?? verified(p, "legalName");
  if (!name)
    throw new InternalDraftError(
      "The brand name must be entered and marked verified before a draft can be built.",
    );
  const audit =
    prospect && prospect.vertical === p.vertical
      ? factsFromProspect(prospect)
      : undefined;
  const phone = profilePhone(p);
  return {
    prospectId: prospect?.id ?? `profile:${p.id}`,
    businessName: name,
    vertical: p.vertical,
    category: verified(p, "businessType"),
    city: verified(p, "serviceArea"),
    address: verified(p, "address"),
    phone: phone?.display,
    phoneLink: phone?.link,
    email: verified(p, "email"),
    existingWebsite: verified(p, "website"),
    directionsUrl: undefined,
    rating: undefined,
    gaps: audit?.gaps ?? [],
    vendors: audit?.vendors ?? [],
    websiteStatus: prospect?.websiteStatus ?? "not_checked",
    ...(p.subtype ? { subtype: p.subtype } : {}),
  };
}

const asOfferings = (items: ProfileItem[], isVerified: boolean): Offering[] =>
  items.map((i) => ({
    name: i.name,
    description: i.description || i.name,
    sample: !isVerified,
    ...(isVerified ? { verified: true } : {}),
  }));

/** A descriptive list: verified = facts; unverified entries = Sample; none = the pack's samples. */
function descriptive(
  p: BusinessProfile,
  k: ProfileListKey,
  fallback: Offering[],
): Offering[] {
  const l = p.lists[k];
  if (!l.items.length || l.status === "required") return fallback;
  return asOfferings(l.items, l.status === "verified");
}

/** Copy built from the profile. Unverified text never becomes a fact. */
export function copyFromProfile(p: BusinessProfile, facts: SiteFacts): SiteCopy {
  const def = verticalDef(p.vertical);
  const pack = proPackFor(p.subtype);
  const base = templateProCopy(pack, def.primaryCta);
  const name = facts.businessName;
  const kind = verified(p, "businessType") ?? pack.noun;
  const where = facts.city ? ` serving ${facts.city}` : "";
  const tagline = verified(p, "tagline");
  const description = verified(p, "description");
  const vf: VerifiableField[] = [];
  if (verified(p, "businessType")) vf.push("heroEyebrow");
  if (tagline) vf.push("heroHeadline");
  if (description) vf.push("heroSubhead", "aboutBody", "metaDescription");

  const reach = facts.phone
    ? `Call ${facts.phone} ${def.action.verb}.`
    : `Get in touch ${def.action.verb}.`;
  const servicesVerified = p.lists.services.status === "verified";
  const offerings = descriptive(p, "services", sample(pack.offerings)).slice(
    0,
    def.validation.maxOfferings,
  );
  const experience = [
    ...asOfferings(verifiedItems(p, "experience"), true),
    ...asOfferings(verifiedItems(p, "statistics"), true),
  ];
  const tools: ToolItem[] = verifiedItems(p, "products").map((i) => ({
    name: i.name,
    description: i.description || i.name,
    status: i.status ?? "planned",
  }));
  const primaryCta = verified(p, "primaryCta") ?? def.primaryCta;
  const titleTail = ` | ${kind}`;
  return {
    seoTitle:
      name.length + titleTail.length <= LIMITS.seoTitle
        ? `${name}${titleTail}`
        : fit(name, LIMITS.seoTitle),
    metaDescription: fit(
      description ?? `${name}: ${kind.toLowerCase()}${where}.`,
      LIMITS.metaDescription,
    ),
    heroEyebrow: fit(kind, LIMITS.heroEyebrow),
    heroHeadline: fit(tagline ?? name, LIMITS.heroHeadline),
    heroSubhead: fit(description ?? `${kind}${where}. ${reach}`, LIMITS.heroSubhead),
    aboutHeading: fit(`About ${name}`, LIMITS.aboutHeading),
    aboutBody: fit(
      description ??
        `${name}: ${kind.toLowerCase()}${where}. The approved description of the business goes here.`,
      LIMITS.aboutBody,
    ),
    aboutSample: !description,
    offeringsHeading: "Services",
    offeringsIntro: servicesVerified
      ? `What ${name} offers.`
      : "Examples to show the layout. Replace them with the verified list before launch.",
    offerings,
    ctaHeading: fit(primaryCta, LIMITS.ctaHeading),
    ctaBody: fit(reach, LIMITS.ctaBody),
    pro: {
      ...base,
      primaryCta,
      secondaryCta: verified(p, "secondaryCta"),
      challenges: descriptive(p, "challenges", base.challenges),
      process: descriptive(p, "process", base.process),
      industries: descriptive(p, "industries", base.industries),
      experienceHeading: "Experience",
      experience,
      proofHeading: "Case studies",
      proof: asOfferings(verifiedItems(p, "caseStudies"), true),
      toolsHeading: "Products and tools",
      tools,
    },
    ...(vf.length ? { verifiedFields: vf } : {}),
  };
}

/** Everything that must happen before an internal draft could become a live site. */
export function launchReadiness(
  p: BusinessProfile,
  facts: SiteFacts,
  missing: string[],
  prospect: Prospect | undefined,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const finding = (k: string) => prospect?.findings.find((f) => f.key === k);
  for (const [i, m] of missing.entries())
    items.push({
      id: `info-${i + 1}`,
      area: "Content",
      task: `Supply and verify: ${m}.`,
      why: "The draft shows an Information required notice until it is verified.",
      owner: "CEO decision",
    });
  const unverifiedClaims = CLAIM_LISTS.filter(
    (k) => p.lists[k].items.length && p.lists[k].status !== "verified",
  );
  if (unverifiedClaims.length)
    items.push({
      id: "verify-claims",
      area: "Verification",
      task: `Check the entered but unverified ${unverifiedClaims.join(", ")} entries; mark them verified only with a source, or delete them.`,
      why: "Unverified claims are kept off the page.",
      owner: "CEO decision",
    });
  for (const [key, task] of [
    [
      "site.claims",
      "The current website shows statistics that could not be verified. Remove them, or verify each one with its source, before any relaunch.",
    ],
    [
      "site.testimonials",
      "The current website shows testimonials. Confirm each is genuine and permitted, or remove it.",
    ],
    [
      "site.placeholder_contact",
      "The current website shows a placeholder-looking phone number. Replace it with the real business number.",
    ],
  ] as const) {
    const f = finding(key);
    if (f?.status === "needs_verification")
      items.push({
        id: `audit-${key}`,
        area: "Verification",
        task,
        why: f.evidence,
        owner: "CEO decision",
      });
  }
  items.push(
    {
      id: "domain",
      area: "Domain",
      task: facts.existingWebsite
        ? `Decide whether the new site replaces ${facts.existingWebsite.replace(/^https?:\/\//, "")} or lives on a new domain or subdomain.`
        : "Choose the public domain or subdomain for this site.",
      why: "The address is a brand decision and may involve a purchase.",
      owner: "CEO decision",
    },
    {
      id: "hosting",
      area: "Hosting",
      task: "Decide where the site is hosted (for example private preview hosting first).",
      why: "Hosting is a paid, ongoing commitment.",
      owner: "CEO decision",
    },
    {
      id: "form",
      area: "Leads and CRM",
      task: "Decide where contact-form messages go before the form is switched on.",
      why: "The form is switched off in the draft.",
      owner: "CEO decision",
    },
    {
      id: "privacy",
      area: "Legal",
      task: verified(p, "privacyUrl")
        ? "Confirm the privacy policy covers the contact form."
        : "Publish a privacy policy (and terms) and add the verified links to the profile.",
      why: "A site that collects contact details needs a privacy policy.",
      owner: "CEO decision",
    },
  );
  if (finding("places.website")?.status === "missing" || !prospect?.placeId)
    items.push({
      id: "gbp",
      area: "Google profile",
      task: "Create or claim the Google Business Profile, and add the website once it is live.",
      why: prospect?.placeId
        ? "The Google listing shows no website."
        : "No Google listing was checked for this business.",
      owner: "CEO decision",
    });
  items.push(
    {
      id: "analytics",
      area: "Measurement",
      task: "Add privacy-respecting visit and enquiry tracking at launch.",
      why: "Results should be measured, not assumed.",
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

/**
 * Everything that would stop a draft being built from this profile: the
 * profile's own checks plus the page's claims check on the copy it produces.
 * The console runs this on every save, so problems show up where they are fixed.
 */
export function profileBuildProblems(p: BusinessProfile): string[] {
  try {
    const facts = factsFromProfile(p, undefined);
    return validateCopy(copyFromProfile(p, facts), facts);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
}

/** Build (or rebuild as the next version) an internal draft from a profile. */
export function buildInternalDraft(
  p: BusinessProfile,
  prospect: Prospect | undefined,
  deps: {
    now: () => Date;
    newId: () => string;
    actor: string;
    previous: SiteDraft | undefined;
  },
): SiteDraft {
  const t0 = performance.now();
  const def = verticalDef(p.vertical);
  if (def.renderer !== "professional")
    throw new InternalDraftError(
      `Internal drafts use the professional template; ${def.label} is not supported yet.`,
    );
  const facts = factsFromProfile(p, prospect);
  const copy = copyFromProfile(p, facts);
  const problems = validateCopy(copy, facts);
  if (problems.length)
    throw new InternalDraftError(
      `The profile produces copy that fails the claims check: ${problems.slice(0, 4).join(" ")}`,
    );
  const missing = profileMissing(p);
  const at = deps.now().toISOString();
  const version = (deps.previous?.version ?? 0) + 1;
  const color = verified(p, "brandColor");
  const privacy = verified(p, "privacyUrl");
  const terms = verified(p, "termsUrl");
  return {
    id: deps.previous?.id ?? deps.newId(),
    prospectId: facts.prospectId,
    version,
    vertical: p.vertical,
    facts,
    copy,
    copySource: "business-profile",
    copyNotes: [],
    options: { showRating: false, showVideoBlock: false },
    checklist: launchReadiness(p, facts, missing, prospect),
    status: "draft",
    createdAt: deps.previous?.createdAt ?? at,
    updatedAt: at,
    buildMs: Math.round(performance.now() - t0),
    approved: undefined,
    audit: [
      ...(deps.previous?.audit ?? []),
      {
        at,
        by: deps.actor,
        action: deps.previous ? "rebuilt" : "built",
        detail: `Version ${version}: internal draft from the Business Profile${missing.length ? `; ${missing.length} item(s) still required` : ""}.`,
      },
    ],
    mode: "internal_draft",
    profileId: p.id,
    infoRequired: missing,
    ...(color
      ? { brand: { ...brandAccent(color), mark: verified(p, "logoText") } }
      : verified(p, "logoText")
        ? { brand: { ...def.accent, mark: verified(p, "logoText") } }
        : {}),
    legalLinks: [
      ...(privacy ? [{ label: "Privacy policy", url: privacy }] : []),
      ...(terms ? [{ label: "Terms", url: terms }] : []),
    ],
  };
}

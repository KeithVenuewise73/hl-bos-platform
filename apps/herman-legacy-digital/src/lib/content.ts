/**
 * Herman Legacy Digital — public content (copy as data).
 *
 * Centralized so pages stay thin and copy is testable. It emphasizes business
 * outcomes and assessment-led transformation — NOT website/SEO/agency language —
 * and never exposes internal terms (schema names, registries, engineering laws).
 */

export const NAV_PRIMARY = [
  { label: "Free AI Scan", href: "/scan" },
  { label: "How We Transform", href: "/transformation" },
  { label: "Solutions", href: "/solutions" },
  { label: "Industries", href: "/industries" },
  { label: "Marketing & Growth", href: "/marketing" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Resources", href: "/resources" },
];

export const NAV_UTILITY = [
  { label: "Book an Assessment", href: "/book" },
  { label: "Contact", href: "/contact" },
  { label: "Client Login", href: "/login" },
];

/** The flagship call to action, used in the header and home hero. */
export const PRIMARY_CTA = {
  label: "Free AI Business Scan",
  href: "/scan",
};

/**
 * Business Transformation Digital Intake (BTDI) — public copy as data. Clear,
 * empathetic, non-technical. No exaggerated promises: completing the intake
 * does not guarantee acceptance or results.
 */
export const BTDI = {
  hero: {
    headline: "Transform the Chaos That Is Stealing Your Time",
    body: "Herman Legacy Digital helps business owners identify the operational, marketing, technology, and visibility problems creating unnecessary stress and limiting growth. Tell us about your business so we can begin building a practical transformation plan designed to create clarity, efficiency, and more freedom.",
    cta: "Begin Your Assessment",
  },
  expectations: [
    "The intake takes about 10–15 minutes. Your answers are saved as you move between steps.",
    "We review your business, website, customer journey, visibility, operations, and market.",
    "You receive a concise 3–5 page Executive Transformation Plan.",
    "Completing the form does not guarantee acceptance or specific results.",
    "A Herman Legacy Digital advisor will contact you about the next step.",
  ],
};

export const POSITIONING =
  "Herman Legacy Digital helps organizations improve visibility, operations, customer acquisition, and growth through AI-powered business transformation.";

export const FOCUS_MARKETS = [
  {
    name: "Logistics",
    line: "For transportation, freight and government logistics operators.",
  },
  {
    name: "Service Industries",
    line: "For service businesses that grow through visibility, reputation and reception.",
  },
  {
    name: "Sports",
    line: "For sports organizations, families and communities.",
  },
];

/** The methodology the public experience must communicate. */
export const METHODOLOGY = [
  { step: "Discovery", detail: "We learn your business, goals and constraints." },
  {
    step: "VisibilityAI",
    detail: "An evidence-based read on how discoverable you are.",
  },
  {
    step: "Executive Assessment",
    detail: "A scored, honest picture of where you stand.",
  },
  {
    step: "Transformation Blueprint",
    detail: "A prioritized plan tied to business outcomes.",
  },
  {
    step: "Software Factory Assembly",
    detail: "We assemble proven capabilities — reuse over rebuild.",
  },
  { step: "Marketing & Growth", detail: "We turn the plan into demand and pipeline." },
  { step: "Measurement", detail: "We report only what is measured — never invented." },
  {
    step: "Continuous Improvement",
    detail: "A long-term partnership, reviewed every quarter.",
  },
];

export interface PageCopy {
  title: string;
  lede: string;
  sections: { heading: string; body: string }[];
}

export const PAGES: Record<string, PageCopy> = {
  home: {
    title: "AI-powered business transformation",
    lede: POSITIONING,
    sections: [
      {
        heading: "Assessment-led, not guesswork",
        body: "We start with a real assessment of your visibility and business, then build a plan tied to outcomes — visibility, operations, customer acquisition and growth.",
      },
      {
        heading: "Reusable technology, faster results",
        body: "We assemble proven capabilities rather than rebuilding from scratch, so transformation moves faster and costs less.",
      },
      {
        heading: "A long-term partnership",
        body: "We measure what matters, report honestly, and review progress with you every quarter.",
      },
    ],
  },
  about: {
    title: "About Herman Legacy Digital",
    lede: "The customer-facing operating company for Herman Legacy's Business Transformation practice. Herman Legacy Group remains the parent holding company.",
    sections: [
      {
        heading: "What we do",
        body: "We help organizations improve visibility, operations, customer acquisition and growth through AI-powered business transformation — assessment first, outcomes always.",
      },
      {
        heading: "How we are different",
        body: "We are not a website company, an SEO agency, or a generic AI agency. We run a disciplined transformation methodology backed by reusable technology.",
      },
    ],
  },
  transformation: {
    title: "How we transform businesses",
    lede: "A disciplined, assessment-led methodology — from discovery to continuous improvement.",
    sections: [
      {
        heading: "The methodology",
        body: "Discovery → VisibilityAI → Executive Assessment → Transformation Blueprint → Software Factory Assembly → Marketing & Growth → Measurement → Continuous Improvement.",
      },
    ],
  },
  solutions: {
    title: "Solutions",
    lede: "Outcomes we deliver, assembled from proven Herman Legacy capabilities.",
    sections: [],
  },
  industries: {
    title: "Industries",
    lede: "We focus where our capabilities compound: Logistics, Service Industries, and Sports.",
    sections: [],
  },
  visibility: {
    title: "Visibility Assessment",
    lede: "See how discoverable your business is — and what to do about it. Request an assessment; a Herman Legacy advisor confirms scope and runs it.",
    sections: [
      {
        heading: "What you'll learn",
        body: "An evidence-based read on your digital visibility, reputation and the highest-leverage improvements — the first step of a transformation.",
      },
    ],
  },
  marketing: {
    title: "Marketing & Growth",
    lede: "We turn your transformation plan into demand — content, campaigns and measurable pipeline.",
    sections: [
      {
        heading: "Growth that follows the plan",
        body: "Marketing is part of the transformation, not a bolt-on. We build demand around the outcomes your assessment identifies.",
      },
    ],
  },
  marketplace: {
    title: "Innovation Marketplace",
    lede: "Explore the Herman Legacy capabilities that power transformations. Your advisor recommends the right path for your business.",
    sections: [],
  },
  resources: {
    title: "Resources",
    lede: "Guides and reference implementations that show our methodology in practice.",
    sections: [
      {
        heading: "Reference implementations",
        body: "We are transforming our own businesses first. Those in-progress reference implementations become the proof — labeled honestly as baselines are established.",
      },
    ],
  },
  book: {
    title: "Book an Assessment",
    lede: "Request an assessment or a consultation. Tell us about your business and we'll confirm the next step.",
    sections: [],
  },
  contact: {
    title: "Contact",
    lede: "Talk to Herman Legacy Digital.",
    sections: [],
  },
};

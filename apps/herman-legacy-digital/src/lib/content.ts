/**
 * Herman Legacy Digital — public content (copy as data).
 *
 * Centralized so pages stay thin and copy is testable (content.test.ts). HLD is
 * Herman Legacy Group's operating digital agency: websites, marketing and
 * practical technology. Copy never publishes a price that is not approved,
 * never presents a product in development as available, and never exposes
 * internal terms (schema names, registries, engineering laws).
 */

export const NAV_PRIMARY = [
  { label: "How We Transform", href: "/transformation" },
  { label: "Services", href: "/solutions" },
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
  label: "Start Your Business Transformation",
  href: "/business-transformation-intake",
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
  "Herman Legacy Digital helps businesses improve their online presence, attract customers and operate more efficiently through websites, marketing and practical technology.";

/**
 * The services HLD delivers today. NO PRICES: every price is a draft awaiting
 * CEO approval (docs/products/herman-legacy-digital/agency-launch-package), so
 * the site says "quoted after a free consultation" until one is approved.
 */
export const SERVICES = [
  {
    name: "Visibility Assessment",
    summary:
      "An evidence-based review of how your business shows up online — website basics, contact options and your Google listing — with a ranked list of fixes. We tell you which checks ran and which did not.",
  },
  {
    name: "Website Design & Build",
    summary:
      "A professional, mobile-friendly website of up to five pages, built from facts you confirm, with a contact form that reaches your inbox.",
  },
  {
    name: "Website Care",
    summary:
      "Hosting, updates, uptime checks, small content edits and a plain-English monthly report on your site and visibility.",
  },
  {
    name: "Local Visibility Setup",
    summary:
      "Your Google Business Profile completed and consistent — categories, hours, services, photos — with your business keeping ownership.",
  },
  {
    name: "Content & Social",
    summary:
      "Monthly posts, short promotional videos from your own photos, and website updates — each approved by you before it is published.",
  },
] as const;

export const PRICING_NOTE =
  "Pricing is quoted after a free consultation, based on what your business needs.";

/** Products that are planned but NOT available. Said plainly, never sold. */
export const NOT_YET_AVAILABLE =
  "Automated missed-call text-back and automated review requests are in development and are not available yet.";

/** Shown wherever the product portfolio is listed. */
export const PORTFOLIO_NOTE =
  "These are Herman Legacy products and capabilities. Many are in development and not yet available — an advisor will tell you what is available today.";

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
    title: "Websites, marketing and practical technology",
    lede: POSITIONING,
    sections: [
      {
        heading: "Get found",
        body: "A professional website and a complete Google listing, so customers can find you and reach you.",
      },
      {
        heading: "Attract customers",
        body: "Clear calls to action, content and local visibility that turn searches into inquiries.",
      },
      {
        heading: "Operate more efficiently",
        body: "Practical technology that saves time — chosen for your business, not for its own sake.",
      },
    ],
  },
  about: {
    title: "About Herman Legacy Digital",
    lede: "Herman Legacy Digital is the digital agency of Herman Legacy Group.",
    sections: [
      {
        heading: "What we do",
        body: POSITIONING,
      },
      {
        heading: "How we work",
        body: "We start by looking at how your business shows up today, recommend what will make the most difference, and build only what you approve. We publish only facts you confirm, and we report only what we have measured.",
      },
      {
        heading: "Our work",
        body: "We build for Herman Legacy Group's own businesses first. We will show client results here only when they are real and the client has agreed.",
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
    title: "Services",
    lede: "Websites, marketing and practical technology for businesses that want to be found, win customers and run more efficiently.",
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
    lede: "Content and local visibility that help the right customers find you and get in touch.",
    sections: [
      {
        heading: "What we do",
        body: "Social posts, short videos made from your own photos, website updates and Google Business Profile upkeep — each approved by you before it goes out.",
      },
      {
        heading: "What we report",
        body: "Only what we can measure. Where something was not measured, the report says so.",
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
    lede: "Tell us about your business. A person at Herman Legacy Digital reads every request and replies.",
    sections: [],
  },
};

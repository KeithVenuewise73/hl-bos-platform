// What a visual review records. Every field is something a real browser
// rendered and this code read back -- or an explicit statement that it could not.

/** What happened when one page was requested. */
export type PageAccess =
  | "ok" // rendered and read
  | "http_blocked" // 401 / 403 / 451: the site refused us
  | "rate_limited" // 429: stop asking
  | "challenge" // a security interstitial, block page or CAPTCHA answered instead
  | "robots_disallowed" // the site's robots.txt asks us not to read this page
  | "unsafe_address" // the address failed the safety checks (private network, bad scheme...)
  | "not_found" // 404 / 410
  | "server_error" // 5xx
  | "timeout"
  | "error"; // anything else (network failure, browser crash)

/** The review as a whole. Only "complete" means the website was visually inspected. */
export type Coverage =
  | "complete" // homepage and every selected page rendered, desktop and mobile captured
  | "partial" // homepage rendered, but some selected pages could not be
  | "blocked" // the homepage itself was refused, challenged or disallowed
  | "failed" // a technical failure on our side (or the site's) stopped the review
  | "not_available"; // no browser is installed on this computer

export type PageRole = "home" | "navigation" | "linked" | "third_party";

export interface LinkSeen {
  text: string;
  href: string;
}

export interface CallToAction extends LinkSeen {
  /** What the words promise, from the link text and address. */
  intent:
    | "book"
    | "register"
    | "buy"
    | "call"
    | "email"
    | "contact"
    | "directions"
    | "schedule"
    | "other";
  /** A known booking/registration provider the link goes to (Presence Scanner list). */
  provider: string | undefined;
}

export interface FormSeen {
  /** Where it would submit (never submitted). */
  action: string;
  method: string;
  fields: number;
  /** Labels or placeholders of the visible fields, truncated. */
  labels: string[];
}

export interface Screenshot {
  /** File name inside the review's evidence folder. */
  file: string;
  width: number;
  height: number;
  /** True when the page was taller than the cap and the capture stops early. */
  truncated: boolean;
}

export interface PageCapture {
  url: string;
  finalUrl: string | undefined;
  role: PageRole;
  /** Why this page was chosen: "homepage", "menu item “Programs”", "booking link “Register now”". */
  reason: string;
  access: PageAccess;
  /** Plain-English account of what happened. */
  detail: string;
  httpStatus: number | undefined;
  title: string | undefined;
  headings: string[];
  navigation: LinkSeen[];
  callsToAction: CallToAction[];
  forms: FormSeen[];
  /** Characters of visible text after rendering. */
  renderedTextLength: number | undefined;
  /** Characters of visible text in the raw HTML (before JavaScript ran). */
  rawTextLength: number | undefined;
  /** The page needed JavaScript to show its content. */
  scriptRendered: boolean | undefined;
  /** At 390px wide, the page scrolls sideways (content wider than the screen). */
  mobileHorizontalScroll: boolean | undefined;
  /** A menu toggle was found and opened in the mobile capture. */
  mobileMenuOpened: boolean | undefined;
  desktop: Screenshot | undefined;
  mobile: Screenshot | undefined;
  /** Non-GET requests the page tried to make, refused by design. */
  refusedRequests: number;
  /** Requests refused because they pointed at an unsafe address. */
  unsafeRequests: number;
  loadMs: number | undefined;
  observedAt: string;
}

export interface VisualReview {
  /** Folder name for the evidence. */
  id: string;
  /**
   * "automatic": the browser chose the pages, read-only (non-GET refused, robots.txt obeyed).
   * "guided": a person browsed the site in a visible window and the software recorded each
   * page they landed on, without clicking, typing or opening anything itself.
   */
  method?: "automatic" | "guided";
  startUrl: string;
  startedAt: string;
  finishedAt: string;
  coverage: Coverage;
  /** One plain-English sentence on why the coverage is what it is. */
  coverageReason: string;
  pages: PageCapture[];
  /** Pages found but not visited, and why (page limit, robots.txt, host stopped). */
  notVisited: { url: string; reason: string }[];
  /** The browser and settings used, for the record. */
  environment: {
    browser: string;
    userAgent: string;
    desktopViewport: string;
    mobileViewport: string;
    maxPages: number;
  };
  version: string;
}

export const VISUAL_REVIEW_VERSION = "visual-review-0.1.0";

// A visual review as evidence the rest of HL-BOS already understands: Presence
// Scanner findings (key "visual.*"), each saying which page and which screenshot
// it rests on. Only pages that were actually viewed are described; anything
// else is "not checked" or "blocked", never "missing".

import type {
  Finding,
  FindingStatus,
  Prospect,
  VisualSummary,
} from "@hl-bos/presence-scanner";

import type { PageCapture, VisualReview } from "./types.ts";

const PROGRAMS =
  /\b(programs?|lessons?|classes|camps?|leagues?|learn to skate|hockey|figure skating|public skat\w*|stick (and|&) puck|rentals?|parties|birthday|memberships?)\b/i;

function finding(
  key: string,
  label: string,
  status: FindingStatus,
  evidence: string,
  at: string,
  confidence: Finding["confidence"] = "high",
): Finding {
  return {
    key,
    label,
    status,
    source: "website",
    observedAt: at,
    evidence,
    confidence,
  };
}

const where = (p: PageCapture) =>
  `${p.finalUrl ?? p.url}${p.desktop || p.mobile ? ` [screenshots: ${[p.desktop?.file, p.mobile?.file].filter(Boolean).join(", ")}]` : ""}`;

/** The findings a review supports. Nothing about pages that were not viewed. */
export function visualFindings(r: VisualReview): Finding[] {
  const at = r.finishedAt;
  const viewed = r.pages.filter((p) => p.access === "ok");
  const ownViewed = viewed.filter((p) => p.role !== "third_party");
  const home = r.pages.find((p) => p.role === "home");
  const scope = `on the ${ownViewed.length} page(s) of the site viewed in a real browser (review ${r.id})`;
  const out: Finding[] = [];

  out.push(
    finding(
      "visual.coverage",
      `${
        r.coverage === "complete"
          ? "Website visually reviewed in a browser"
          : r.coverage === "partial"
            ? "Website partly reviewed in a browser"
            : r.coverage === "blocked"
              ? "Website could not be viewed in a browser"
              : "Website not visually reviewed"
      }${
        r.method !== "guided"
          ? ""
          : r.coverage === "complete" || r.coverage === "partial"
            ? " (viewed by you, in a window you browsed)"
            : " (in your own browsing session)"
      }`,
      r.coverage === "complete" || r.coverage === "partial"
        ? "present"
        : r.coverage === "blocked"
          ? "blocked"
          : "not_checked",
      `${r.coverageReason} (${r.version}, ${r.environment.browser}, ${r.finishedAt.slice(0, 16).replace("T", " ")} UTC).`,
      at,
      r.coverage === "partial" ? "medium" : "high",
    ),
  );
  if (!home || home.access !== "ok") return out;

  // Navigation
  const menu = home.navigation.map((l) => l.text).filter(Boolean);
  out.push(
    menu.length
      ? finding(
          "visual.navigation",
          "Has a navigation menu",
          "present",
          `Menu on ${where(home)}: ${menu.slice(0, 15).join(" · ")}${menu.length > 15 ? " …" : ""}.`,
          at,
        )
      : finding(
          "visual.navigation",
          "No navigation menu found",
          "not_found",
          `No menu links were found in the header or navigation of ${where(home)}.`,
          at,
          "medium",
        ),
  );

  // Mobile layout (responsive layout at 390px)
  if (home.mobileHorizontalScroll !== undefined)
    out.push(
      home.mobileHorizontalScroll
        ? finding(
            "visual.mobile_layout",
            "Homepage does not fit a phone screen",
            "missing",
            `At 390px wide the homepage scrolls sideways (content wider than the screen): ${where(home)}.`,
            at,
          )
        : finding(
            "visual.mobile_layout",
            "Homepage fits a phone screen",
            "present",
            `At 390px wide the homepage fits the screen with no sideways scrolling: ${where(home)}.`,
            at,
          ),
    );
  if (home.mobileMenuOpened)
    out.push(
      finding(
        "visual.mobile_menu",
        "Mobile menu opens",
        "present",
        `A menu toggle opened at 390px wide on ${where(home)}.`,
        at,
      ),
    );

  // Programs / services pages
  const programPages = ownViewed.filter((p) =>
    PROGRAMS.test(`${p.title ?? ""} ${p.headings.join(" ")} ${p.url}`),
  );
  out.push(
    programPages.length
      ? finding(
          "visual.programs",
          "Programs or services are described",
          "present",
          programPages
            .slice(0, 6)
            .map((p) => `“${p.title ?? p.headings[0] ?? p.url}” ${where(p)}`)
            .join("; ") + ".",
          at,
        )
      : finding(
          "visual.programs",
          "No programs or services page found",
          "not_found",
          `No page about programs, lessons, rentals or services was found ${scope}.`,
          at,
          "medium",
        ),
  );

  // Booking / registration paths
  const paths = ownViewed.flatMap((p) =>
    p.callsToAction
      .filter((c) => c.intent === "book" || c.intent === "register")
      .map((c) => ({ c, on: p })),
  );
  const uniquePaths = [...new Map(paths.map((x) => [x.c.href, x])).values()];
  out.push(
    uniquePaths.length
      ? finding(
          "visual.booking_path",
          "Has an online booking or registration path",
          "present",
          uniquePaths
            .slice(0, 6)
            .map(
              (x) =>
                `“${x.c.text || x.c.intent}” → ${x.c.provider ? `${x.c.provider} (${new URL(x.c.href).hostname})` : x.c.href} on ${x.on.finalUrl ?? x.on.url}`,
            )
            .join("; ") + ".",
          at,
        )
      : finding(
          "visual.booking_path",
          "No booking or registration link found",
          "not_found",
          `No link to book, reserve or register was found ${scope}.`,
          at,
          "medium",
        ),
  );
  for (const t of r.pages.filter((p) => p.role === "third_party")) {
    const host = (() => {
      try {
        return new URL(t.url).hostname;
      } catch {
        return t.url;
      }
    })();
    out.push(
      t.access === "ok"
        ? finding(
            `visual.third_party.${host}`,
            `Booking/registration page on ${host} loads`,
            "present",
            `${t.reason}: the landing page rendered (${where(t)}). Nothing on it was clicked or submitted.`,
            at,
          )
        : finding(
            `visual.third_party.${host}`,
            `Booking/registration page on ${host} could not be viewed`,
            t.access === "robots_disallowed" ||
              t.access === "http_blocked" ||
              t.access === "rate_limited" ||
              t.access === "challenge"
              ? "blocked"
              : "not_checked",
            `${t.reason}: ${t.detail}`,
            at,
          ),
    );
  }

  // Contact
  const contact = ownViewed.flatMap((p) =>
    p.callsToAction
      .filter(
        (c) => c.intent === "call" || c.intent === "email" || c.intent === "contact",
      )
      .map((c) => ({ c, on: p })),
  );
  const forms = ownViewed.flatMap((p) =>
    p.forms.filter((f) => f.fields > 0).map((f) => ({ f, on: p })),
  );
  out.push(
    contact.length || forms.length
      ? finding(
          "visual.contact",
          "Visitors can get in touch",
          "present",
          [
            ...contact
              .slice(0, 4)
              .map(
                (x) =>
                  `${x.c.intent} “${x.c.text || x.c.href}” on ${x.on.finalUrl ?? x.on.url}`,
              ),
            ...forms
              .slice(0, 2)
              .map(
                (x) =>
                  `a ${x.f.fields}-field form (${x.f.labels.slice(0, 4).join(", ") || "unlabelled"}) on ${x.on.finalUrl ?? x.on.url} — not submitted`,
              ),
          ].join("; ") + ".",
          at,
        )
      : finding(
          "visual.contact",
          "No way to get in touch found",
          "not_found",
          `No phone link, email link, contact link or form was found ${scope}.`,
          at,
          "medium",
        ),
  );

  if (home.scriptRendered)
    out.push(
      finding(
        "visual.script_rendered",
        "Content is drawn by JavaScript",
        "present",
        `The raw HTML of ${home.finalUrl ?? home.url} carries ${home.rawTextLength ?? 0} characters of text; after rendering, ${home.renderedTextLength ?? 0}. Search engines and simple tools see the former.`,
        at,
      ),
    );
  return out;
}

export function visualSummary(r: VisualReview): VisualSummary {
  return {
    reviewId: r.id,
    coverage: r.coverage,
    coverageReason: r.coverageReason,
    pagesViewed: r.pages.filter((p) => p.access === "ok").length,
    finishedAt: r.finishedAt,
    version: r.version,
  };
}

/** The lead with this review's findings in place of any earlier visual review's. */
export function withVisualReview(p: Prospect, r: VisualReview): Prospect {
  return {
    ...p,
    findings: [
      ...p.findings.filter((f) => !f.key.startsWith("visual.")),
      ...visualFindings(r),
    ],
    visual: visualSummary(r),
    audit: [
      ...p.audit,
      {
        at: r.finishedAt,
        by: "visual-review",
        action: "visual_review",
        detail: `${r.coverage}: ${r.coverageReason}`,
      },
    ],
  };
}

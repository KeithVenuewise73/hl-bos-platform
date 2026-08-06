import { describe, it, expect } from "vitest";
import { mergeEvidence } from "./merge.ts";
import { analyzeHtml } from "./extract.ts";
import { analyzeBusinessPages, analyzeBusiness } from "./analyze.ts";

const HOME = `<!doctype html><html><head><title>Acme Freight</title></head>
<body><h1>Acme Freight</h1><p>We haul freight.</p>
<a href="/services">Services</a><a href="/contact">Contact</a></body></html>`;

// A contact page that DOES have a form + phone the homepage lacked.
const CONTACT = `<!doctype html><html><head><title>Contact — Acme</title></head>
<body><h1>Contact</h1><a href="tel:5551234567">Call</a>
<form action="/lead"><input name="email"><button>Request a quote</button></form>
<a href="https://facebook.com/acme">Facebook</a></body></html>`;

describe("mergeEvidence", () => {
  const home = analyzeHtml(HOME, "https://acme.example.com");
  const contact = analyzeHtml(CONTACT, "https://acme.example.com/contact");
  const merged = mergeEvidence([home, contact]);

  it("returns the single page unchanged when only one is given", () => {
    expect(mergeEvidence([home])).toEqual(home);
  });

  it("OR-s presence signals across pages (form/phone found on a sub-page)", () => {
    expect(home.forms).toBe(0);
    expect(home.hasTel).toBe(false);
    expect(merged.forms).toBeGreaterThan(0); // the contact page's form counts
    expect(merged.hasTel).toBe(true);
  });

  it("unions catalogs and sums content across pages", () => {
    expect(merged.socialLinks).toContain("facebook");
    expect(merged.wordCount).toBe(home.wordCount + contact.wordCount);
  });

  it("keeps homepage identity fields", () => {
    expect(merged.url).toBe(home.url);
    expect(merged.title).toBe(home.title);
  });
});

describe("analyzeBusinessPages", () => {
  it("reports how many pages were analyzed and reflects site-wide evidence", () => {
    const single = analyzeBusiness({
      name: "Acme Freight",
      website: "https://acme.example.com",
      industry: "transportation",
      html: HOME,
    });
    const multi = analyzeBusinessPages({
      name: "Acme Freight",
      website: "https://acme.example.com",
      industry: "transportation",
      pages: [
        { url: "https://acme.example.com", html: HOME },
        { url: "https://acme.example.com/contact", html: CONTACT },
      ],
    });
    expect(single.pagesAnalyzed).toBe(1);
    expect(multi.pagesAnalyzed).toBe(2);
    // The site-wide scan sees the contact form/phone the homepage-only scan missed,
    // so lead-generation / conversion should score no worse across the site.
    const leadSingle = single.scorecard.find((s) => s.dimension === "lead_generation");
    const leadMulti = multi.scorecard.find((s) => s.dimension === "lead_generation");
    expect(leadMulti!.rating).toBeGreaterThanOrEqual(leadSingle!.rating);
    expect(multi.coverageNote).toContain("2 pages");
  });
});

import { describe, it, expect } from "vitest";
import { extractInternalLinks } from "./fetch-site";

const HTML = `<!doctype html><html><body>
  <a href="/services">Services</a>
  <a href="/about-us">About</a>
  <a href="/contact">Contact</a>
  <a href="/blog/post-1">Blog</a>
  <a href="https://acme.example.com/pricing">Pricing</a>
  <a href="https://www.acme.example.com/team">Team</a>
  <a href="https://facebook.com/acme">Facebook (external)</a>
  <a href="mailto:hi@acme.example.com">Email</a>
  <a href="tel:5551234567">Call</a>
  <a href="/brochure.pdf">Brochure</a>
  <a href="#top">Top</a>
  <a href="/services">Services again (dupe)</a>
</body></html>`;

describe("extractInternalLinks", () => {
  const links = extractInternalLinks(HTML, "https://acme.example.com/", 5);

  it("keeps only same-domain page links", () => {
    for (const l of links) expect(l).toMatch(/^https:\/\/(www\.)?acme\.example\.com\//);
    expect(links.some((l) => l.includes("facebook.com"))).toBe(false);
  });

  it("drops assets, mailto, tel, and fragments", () => {
    expect(links.some((l) => l.endsWith(".pdf"))).toBe(false);
    expect(links.some((l) => l.includes("mailto"))).toBe(false);
    expect(links.some((l) => l.includes("tel:"))).toBe(false);
    expect(links.some((l) => l.includes("#"))).toBe(false);
  });

  it("de-duplicates repeated paths", () => {
    const services = links.filter((l) => l.endsWith("/services"));
    expect(services.length).toBeLessThanOrEqual(1);
  });

  it("prioritizes consultant pages (services/about/contact) over blog", () => {
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(5);
    // With a cap, the priority pages should be chosen ahead of /blog/*.
    const blogIndex = links.findIndex((l) => l.includes("/blog/"));
    const servicesIndex = links.findIndex((l) => l.endsWith("/services"));
    if (blogIndex !== -1 && servicesIndex !== -1) {
      expect(servicesIndex).toBeLessThan(blogIndex);
    }
  });

  it("respects the max cap", () => {
    expect(extractInternalLinks(HTML, "https://acme.example.com/", 2).length).toBe(2);
  });
});

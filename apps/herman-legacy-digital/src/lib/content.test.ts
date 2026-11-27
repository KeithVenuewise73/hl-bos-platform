import { describe, it, expect } from "vitest";
import {
  POSITIONING,
  PAGES,
  SERVICES,
  PRICING_NOTE,
  NOT_YET_AVAILABLE,
  NAV_PRIMARY,
} from "./content";

const allCopy = JSON.stringify({ PAGES, SERVICES, PRICING_NOTE, NOT_YET_AVAILABLE });

describe("public site copy", () => {
  it("states the approved agency positioning", () => {
    expect(POSITIONING).toBe(
      "Herman Legacy Digital helps businesses improve their online presence, attract customers and operate more efficiently through websites, marketing and practical technology.",
    );
    expect(PAGES["home"]!.lede).toBe(POSITIONING);
  });

  it("no longer says HLD is not a website company", () => {
    expect(allCopy).not.toMatch(/not a website company/i);
  });

  it("publishes no prices (all prices are unapproved drafts)", () => {
    expect(allCopy).not.toMatch(/\$\s?\d/);
    expect(allCopy).not.toMatch(/\b\d+\s?(\/mo|per month|a month)\b/i);
    expect(PRICING_NOTE).toMatch(/quoted after a free consultation/);
  });

  it("does not offer missed-call text-back or review automation as a service", () => {
    const offered = JSON.stringify(SERVICES);
    expect(offered).not.toMatch(/missed.?call|text.?back|lead recovery/i);
    expect(offered).not.toMatch(/review (reminder|request|generation)/i);
    expect(NOT_YET_AVAILABLE).toMatch(/not available yet/);
  });

  it("names the Services page in the navigation", () => {
    expect(NAV_PRIMARY).toContainEqual({ label: "Services", href: "/solutions" });
  });
});

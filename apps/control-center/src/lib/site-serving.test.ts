import { describe, it, expect } from "vitest";
import {
  PROBE_SLUG,
  SHOP_PAGES_BASE,
  describeServing,
  probeUrl,
  resolveSiteBase,
} from "./site-serving";

describe("the probe address", () => {
  it("asks for a slug nothing will ever be published at", () => {
    // It must still be a slug the database would accept, or the function would
    // 404 it at the routing step and the probe would pass for the wrong reason.
    expect(PROBE_SLUG).toMatch(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
  });

  it("is built from the base without doubling the slash", () => {
    expect(probeUrl("https://x.example/site")).toBe(
      `https://x.example/site/${PROBE_SLUG}`,
    );
    expect(probeUrl("https://x.example/site/")).toBe(
      `https://x.example/site/${PROBE_SLUG}`,
    );
  });

  it("checks the real address unless a machine-local override says otherwise", () => {
    expect(resolveSiteBase(null)).toEqual({ base: SHOP_PAGES_BASE, overridden: false });
    expect(resolveSiteBase("")).toEqual({ base: SHOP_PAGES_BASE, overridden: false });
    expect(resolveSiteBase("   ")).toEqual({
      base: SHOP_PAGES_BASE,
      overridden: false,
    });
    expect(resolveSiteBase("http://127.0.0.1:3000")).toEqual({
      base: "http://127.0.0.1:3000",
      overridden: true,
    });
  });

  it("points at the agency's own domain, not a Supabase URL", () => {
    // The Supabase function cannot serve HTML at all, so a console that probed
    // it would be measuring the wrong thing and reporting a failure that no
    // longer matters.
    expect(SHOP_PAGES_BASE).toBe("https://shops.hermanlegacydigital.com");
    expect(SHOP_PAGES_BASE).not.toContain("supabase");
  });
});

describe("what a customer would actually get", () => {
  it("says yes only when the answer is HTML", () => {
    const v = describeServing({ status: 404, contentType: "text/html; charset=utf-8" });
    expect(v.servedAsWebPage).toBe(true);
    expect(v.headline).toContain("real web pages");
    expect(v.remedy).toBe("");
  });

  it("catches the failure this whole check exists for", () => {
    // The live finding: the function answers correctly and Supabase rewrites
    // the HTML to text/plain on its shared domain, so a browser shows source.
    const v = describeServing({ status: 404, contentType: "text/plain" });
    expect(v.servedAsWebPage).toBe(false);
    expect(v.headline).toContain("source code");
    expect(v.detail).toContain("text/plain");
    expect(v.remedy).toContain("own address");
  });

  it("does not call a missing content type HTML", () => {
    expect(describeServing({ status: 404, contentType: null }).servedAsWebPage).toBe(
      false,
    );
    expect(describeServing({ status: 404 }).servedAsWebPage).toBe(false);
  });

  it("treats 404 as the correct answer, because the probe asks for nothing", () => {
    // A 200 here would mean something ELSE is answering -- the probe slug is
    // never published, so a page coming back is a misconfigured address.
    const ok = describeServing({ status: 404, contentType: "text/html" });
    expect(ok.servedAsWebPage).toBe(true);
    const wrong = describeServing({ status: 200, contentType: "text/html" });
    expect(wrong.servedAsWebPage).toBe(false);
    expect(wrong.headline).toContain("Something else");
  });

  it("a 401 is not read as a serving problem but as a wrong address", () => {
    const v = describeServing({ status: 401 });
    expect(v.servedAsWebPage).toBe(false);
    expect(v.detail).toContain("401");
  });

  it("an unreachable server says so, and says it might be this machine", () => {
    const v = describeServing({ error: "fetch failed" });
    expect(v.servedAsWebPage).toBe(false);
    expect(v.detail).toContain("fetch failed");
    expect(v.remedy).toContain("not been deployed");
  });

  it("an empty error message still produces a sentence, not a blank", () => {
    const v = describeServing({ error: "" });
    expect(v.servedAsWebPage).toBe(false);
    expect(v.detail.length).toBeGreaterThan(10);
  });

  it("never claims success on a shape it did not understand", () => {
    // Anything that is not an explicit HTML 404 is a no. There is no path
    // through this function that guesses in favour of working.
    for (const r of [
      { status: 500, contentType: "text/html" },
      { status: 404, contentType: "application/json" },
      { status: 302, contentType: "text/html" },
      { error: "boom" },
      {},
    ]) {
      expect(describeServing(r).servedAsWebPage).toBe(false);
    }
  });
});

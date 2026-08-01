import { describe, it, expect } from "vitest";
import { devBypassEnabled } from "./access";
import { isAnalyticsEvent, normalizeEvent, ANALYTICS_EVENTS } from "./analytics";

describe("dev bypass is impossible in production", () => {
  it("returns false in production regardless of the flag", () => {
    expect(
      devBypassEnabled({ nodeEnv: "production", hlBosEnv: undefined, devClient: "1" }),
    ).toBe(false);
    expect(
      devBypassEnabled({
        nodeEnv: "development",
        hlBosEnv: "production",
        devClient: "1",
      }),
    ).toBe(false);
  });

  it("returns true only in non-production WITH an explicit flag", () => {
    expect(
      devBypassEnabled({ nodeEnv: "development", hlBosEnv: undefined, devClient: "1" }),
    ).toBe(true);
    expect(
      devBypassEnabled({
        nodeEnv: "development",
        hlBosEnv: undefined,
        devClient: undefined,
      }),
    ).toBe(false);
  });
});

describe("analytics event catalog", () => {
  it("instruments the required measurable events", () => {
    for (const e of [
      "page_visit",
      "assessment_start",
      "assessment_submit",
      "consultation_request",
      "client_login",
      "marketplace_view",
      "solution_interest_request",
      "document_view",
      "portal_engagement",
    ]) {
      expect(ANALYTICS_EVENTS).toContain(e);
    }
  });

  it("rejects unknown events and never invents outcome metrics", () => {
    expect(isAnalyticsEvent("revenue")).toBe(false);
    expect(isAnalyticsEvent("roi")).toBe(false);
    expect(normalizeEvent("revenue", "/", {})).toBeNull();
    expect(normalizeEvent("page_visit", "/solutions", { a: "b" })?.event).toBe(
      "page_visit",
    );
  });
});

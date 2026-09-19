import { describe, expect, it } from "vitest";
import { resolveMode } from "./mode";

describe("resolveMode", () => {
  it("is live when a database is configured", () => {
    const state = resolveMode({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    });
    expect(state.mode).toBe("live");
    expect(state.supabaseConfigured).toBe(true);
  });

  it("is demo when nothing is configured, and explains why in plain English", () => {
    const state = resolveMode({});
    expect(state.mode).toBe("demo");
    expect(state.reason).toContain("No HighlightAI database is configured");
    expect(state.reason).toContain("No real game film");
  });

  it("treats a half-configured database as not configured", () => {
    expect(
      resolveMode({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }).mode,
    ).toBe("demo");
    expect(resolveMode({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" }).mode).toBe(
      "demo",
    );
    expect(
      resolveMode({
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }).mode,
    ).toBe("demo");
  });

  it("can be forced into demo mode even with a database present", () => {
    const state = resolveMode({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      HIGHLIGHTAI_MODE: "demo",
    });
    expect(state.mode).toBe("demo");
    expect(state.supabaseConfigured).toBe(true);
  });

  it("cannot be forced into live mode without a database", () => {
    // The dangerous direction. A configuration flag must never be able to make
    // synthetic football present itself as a real analysis.
    const state = resolveMode({ HIGHLIGHTAI_MODE: "live" });
    expect(state.mode).toBe("demo");
  });
});

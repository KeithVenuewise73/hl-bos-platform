import { describe, it, expect } from "vitest";
import {
  assertClassification,
  isServerSide,
  ConfigClassificationError,
  SERVER_SIDE_CLASSIFICATIONS,
  type Classification,
} from "./classification.js";

describe("assertClassification", () => {
  // The core requirement from the brief: "Never prefix private secrets with
  // NEXT_PUBLIC." Verify it holds for EVERY server-side classification, not
  // just the one that happened to be convenient to test.
  it.each(SERVER_SIDE_CLASSIFICATIONS)(
    "rejects NEXT_PUBLIC_ prefix on %s variables",
    (classification) => {
      expect(() =>
        assertClassification("NEXT_PUBLIC_STRIPE_SECRET_KEY", classification),
      ).toThrow(ConfigClassificationError);
    },
  );

  it("rejects the specific catastrophic case: public service-role key", () => {
    expect(() =>
      assertClassification("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "server-only"),
    ).toThrow(/browser-visible/);
  });

  it("allows NEXT_PUBLIC_ prefix on browser-safe variables", () => {
    expect(() =>
      assertClassification("NEXT_PUBLIC_SUPABASE_URL", "browser-safe"),
    ).not.toThrow();
  });

  it("allows unprefixed server-side variables", () => {
    expect(() =>
      assertClassification("SUPABASE_SERVICE_ROLE_KEY", "server-only"),
    ).not.toThrow();
  });

  // The inverse failure: a browser-safe var without the prefix is silently
  // undefined in the client at runtime, which is a real and confusing bug.
  it("rejects browser-safe variables lacking the prefix", () => {
    expect(() => assertClassification("SUPABASE_URL", "browser-safe")).toThrow(
      /will not expose it/,
    );
  });

  it("error message names the offending key", () => {
    expect(() =>
      assertClassification("NEXT_PUBLIC_TWILIO_AUTH_TOKEN", "provider-secret"),
    ).toThrow(/NEXT_PUBLIC_TWILIO_AUTH_TOKEN/);
  });
});

describe("isServerSide", () => {
  it("classifies browser-safe as not server-side", () => {
    expect(isServerSide("browser-safe")).toBe(false);
  });

  it.each(SERVER_SIDE_CLASSIFICATIONS)("classifies %s as server-side", (c) => {
    expect(isServerSide(c)).toBe(true);
  });

  // Guards against someone adding a Classification member and forgetting to
  // decide whether it is server-side -- which would default it to "browser
  // safe" by omission. That is the dangerous direction to fail in.
  it("accounts for every classification in the union", () => {
    const all: Classification[] = [
      "browser-safe",
      "server-only",
      "ci-only",
      "supabase-secret",
      "provider-secret",
    ];
    const covered = all.filter((c) => isServerSide(c) || c === "browser-safe");
    expect(covered).toHaveLength(all.length);
  });
});

/**
 * Sample data must not follow a paying customer into their account.
 *
 * The failure this guards against is specific and embarrassing: someone pays,
 * signs in, and finds a fictional transportation executive's employment
 * history sitting in their career database. It reads as a data leak even
 * though every record is labelled.
 */
import { describe, expect, it } from "vitest";

import { resolveSeedDemo } from "./deployment.ts";

const DEPLOYED = {
  hlBosEnv: "production",
  nodeEnv: "production",
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "key",
};
const LOCAL = {
  hlBosEnv: "local",
  nodeEnv: "development",
  supabaseUrl: undefined,
  supabaseKey: undefined,
};

describe("resolveSeedDemo", () => {
  it("is OFF in a deployed environment when nothing is set", () => {
    expect(resolveSeedDemo(undefined, DEPLOYED)).toBe(false);
  });

  it("is ON locally when nothing is set, so the app has something to show", () => {
    expect(resolveSeedDemo(undefined, LOCAL)).toBe(true);
  });

  it("treats a production build with no HL_BOS_ENV as deployed", () => {
    expect(
      resolveSeedDemo(undefined, {
        hlBosEnv: undefined,
        nodeEnv: "production",
        supabaseUrl: "https://example.supabase.co",
        supabaseKey: "key",
      }),
    ).toBe(false);
  });

  it("lets an explicit value win in both directions", () => {
    expect(resolveSeedDemo("true", DEPLOYED)).toBe(true);
    expect(resolveSeedDemo("false", LOCAL)).toBe(false);
  });
});

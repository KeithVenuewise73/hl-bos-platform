import { describe, expect, it } from "vitest";

import { hasWorkingProvider, listProviders } from "./providers";

describe("listProviders", () => {
  it("reports the storyboard camera as the one thing that works today", () => {
    const ready = listProviders({}).filter((p) => p.status === "ready");
    expect(ready.map((p) => p.id)).toEqual(["storyboard-camera"]);
    expect(hasWorkingProvider({})).toBe(true);
  });

  it("never reports a generative provider as ready just because a key exists", () => {
    // The dangerous failure this guards against: a key in the environment
    // flipping a button to "enabled" when no code behind it can call anything.
    const providers = listProviders({
      HLBOS_GOOGLE_AI_API_KEY: "a-real-looking-key",
      HLBOS_RUNWAY_API_KEY: "another-one",
    });
    const generative = providers.filter((p) => p.kind === "generated-motion");
    expect(generative.length).toBeGreaterThan(0);
    expect(generative.every((p) => p.status === "needs-account")).toBe(true);
  });

  it("says what is missing, differently depending on whether a key is set", () => {
    const withoutKey = listProviders({}).find((p) => p.id === "google-veo");
    const withKey = listProviders({ HLBOS_GOOGLE_AI_API_KEY: "k" }).find(
      (p) => p.id === "google-veo",
    );
    expect(withoutKey?.toEnable).toContain("Needs a paid");
    expect(withKey?.toEnable).toContain("has no code that calls");
  });

  it("gives every provider a description, and every blocked one a way out", () => {
    for (const provider of listProviders({})) {
      expect(provider.name.length).toBeGreaterThan(0);
      expect(provider.whatItDoes.length).toBeGreaterThan(20);
      if (provider.status === "ready") expect(provider.toEnable).toBe("");
      else expect(provider.toEnable.length).toBeGreaterThan(20);
    }
  });
});

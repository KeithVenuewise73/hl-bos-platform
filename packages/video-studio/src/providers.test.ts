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
    expect(generative.every((p) => p.status === "not-built")).toBe(true);
  });

  it("blames the missing connection, not a missing key, when a key is present", () => {
    const withoutKey = listProviders({}).find((p) => p.id === "google-veo");
    const withKey = listProviders({ HLBOS_GOOGLE_AI_API_KEY: "k" }).find(
      (p) => p.id === "google-veo",
    );
    expect(withoutKey?.toEnable).toContain("No code here calls");
    expect(withKey?.toEnable).toContain("the key alone does not switch it on");
  });

  it("does not ask for a credential the route does not use", () => {
    const selfHosted = listProviders({}).find((p) => p.id === "self-hosted-open-model");
    expect(selfHosted?.credentialEnvVar).toBe("");
    expect(selfHosted?.toEnable).toContain("No account, no credential");
  });

  it("writes each route's explanation as a readable sentence, not a template", () => {
    // A single template produced "Nothing in this platform calls An open model
    // on our own machine yet." Every route now carries its own wording.
    for (const provider of listProviders({})) {
      if (provider.status === "ready") continue;
      expect(provider.toEnable).not.toContain(provider.name);
    }
  });

  it("lists the free routes before the paid ones", () => {
    // Ordering is load-bearing: the free options are the ones a reader skims
    // past on the way to the famous paid names.
    const ids = listProviders({}).map((p) => p.id);
    expect(ids.indexOf("self-hosted-open-model")).toBeLessThan(ids.indexOf("runway"));
    expect(ids.indexOf("google-veo")).toBeLessThan(ids.indexOf("replicate"));
  });

  it("says what every route costs, in words about money", () => {
    for (const provider of listProviders({})) {
      expect(provider.cost.length).toBeGreaterThan(10);
      expect(provider.cost).toMatch(/free|paid|cost|billed|charge/i);
    }
  });

  it("gives every route a description, and every blocked one a way out", () => {
    for (const provider of listProviders({})) {
      expect(provider.name.length).toBeGreaterThan(0);
      expect(provider.whatItDoes.length).toBeGreaterThan(20);
      if (provider.status === "ready") expect(provider.toEnable).toBe("");
      else expect(provider.toEnable.length).toBeGreaterThan(20);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  deploymentMode,
  isDeployedEnvironment,
  supabaseConfigured,
} from "./deployment.ts";

const SUPABASE = {
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "sb_publishable_example_key_value",
};
const NO_SUPABASE = { supabaseUrl: undefined, supabaseKey: undefined };

describe("deploymentMode — the guard that stops a child's game video being published", () => {
  it("runs locally with no login when nothing is deployed and nothing is configured", () => {
    expect(
      deploymentMode({ hlBosEnv: "local", nodeEnv: "development", ...NO_SUPABASE }),
    ).toBe("local");
  });

  it("REFUSES to serve when deployed with no way to sign in", () => {
    // The whole point of this file. Without it, this exact configuration
    // serves identifiable video of somebody's child to the internet.
    for (const hlBosEnv of ["preview", "staging", "production"]) {
      expect(deploymentMode({ hlBosEnv, nodeEnv: "production", ...NO_SUPABASE })).toBe(
        "refuse",
      );
    }
  });

  it("treats a production build as deployed even when HL_BOS_ENV is forgotten", () => {
    // Forgetting one environment variable must not be the difference between
    // private and public.
    expect(
      deploymentMode({ hlBosEnv: undefined, nodeEnv: "production", ...NO_SUPABASE }),
    ).toBe("refuse");
    expect(
      deploymentMode({ hlBosEnv: "", nodeEnv: "production", ...NO_SUPABASE }),
    ).toBe("refuse");
  });

  it("requires sign-in once deployed with Supabase configured", () => {
    expect(
      deploymentMode({ hlBosEnv: "production", nodeEnv: "production", ...SUPABASE }),
    ).toBe("authenticated");
  });

  it("requires sign-in locally too, once Supabase is configured", () => {
    expect(
      deploymentMode({ hlBosEnv: "local", nodeEnv: "development", ...SUPABASE }),
    ).toBe("authenticated");
  });

  it("does not accept a half-configured provider as configured", () => {
    expect(
      supabaseConfigured({
        hlBosEnv: "local",
        nodeEnv: "development",
        supabaseUrl: SUPABASE.supabaseUrl,
        supabaseKey: "",
      }),
    ).toBe(false);
    expect(
      deploymentMode({
        hlBosEnv: "production",
        nodeEnv: "production",
        supabaseUrl: SUPABASE.supabaseUrl,
        supabaseKey: undefined,
      }),
    ).toBe("refuse");
  });

  it("knows which environments are reachable by other people", () => {
    expect(
      isDeployedEnvironment({
        hlBosEnv: "local",
        nodeEnv: "production",
        ...NO_SUPABASE,
      }),
    ).toBe(false);
    expect(
      isDeployedEnvironment({
        hlBosEnv: "staging",
        nodeEnv: "development",
        ...NO_SUPABASE,
      }),
    ).toBe(true);
  });
});

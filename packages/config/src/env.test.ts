import { describe, it, expect, afterEach } from "vitest";
import {
  loadEnv,
  requireServerEnv,
  describeEnv,
  ENV_SPEC,
  EnvValidationError,
} from "./env.js";
import {
  assertClassification,
  isServerSide,
  ConfigClassificationError,
} from "./classification.js";

/** A complete, valid environment. Every value is fake. */
const validEnv = {
  NODE_ENV: "test",
  HL_BOS_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "https://example-ref.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake_value_for_tests",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake_value_for_tests_only",
} as const;

describe("ENV_SPEC integrity", () => {
  // The spec is the contract. If the spec itself is self-contradictory, every
  // downstream guarantee is void -- so validate the validator.
  it("every declared variable is internally consistent", () => {
    for (const spec of ENV_SPEC) {
      expect(() => assertClassification(spec.key, spec.classification)).not.toThrow();
    }
  });

  it("declares no duplicate keys", () => {
    const keys = ENV_SPEC.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every variable has a non-trivial description", () => {
    for (const spec of ENV_SPEC) {
      expect(spec.description.length, `${spec.key} description`).toBeGreaterThan(20);
    }
  });

  // .env.example must contain placeholders only. This test is what stands
  // between "example file" and "committed credential".
  it("no example value looks like a real credential", () => {
    for (const spec of ENV_SPEC) {
      const looksReal =
        /^(sb_secret_|sk_live_|sk_test_|AC[0-9a-f]{32})/.test(spec.example) &&
        !/x{4,}|fake|placeholder|your-/i.test(spec.example);
      expect(looksReal, `${spec.key} example may be a real secret`).toBe(false);
    }
  });
});

describe("loadEnv", () => {
  it("loads a complete valid environment", () => {
    const env = loadEnv({ source: validEnv });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example-ref.supabase.co");
    expect(env.HL_BOS_ENV).toBe("local");
  });

  it("throws EnvValidationError when a required variable is missing", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...incomplete } = validEnv;
    expect(() => loadEnv({ source: incomplete })).toThrow(EnvValidationError);
  });

  it("names the missing variable in the error", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...incomplete } = validEnv;
    expect(() => loadEnv({ source: incomplete })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY is not set/,
    );
  });

  // Reporting one error per run makes configuring a new environment a guessing
  // game. Operators should get the full list on the first attempt.
  it("reports ALL problems at once, not just the first", () => {
    try {
      loadEnv({ source: { NODE_ENV: "test" } });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      expect((e as EnvValidationError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("rejects a malformed URL", () => {
    expect(() =>
      loadEnv({ source: { ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" } }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL is invalid/);
  });

  it("rejects an implausibly short key", () => {
    expect(() =>
      loadEnv({ source: { ...validEnv, SUPABASE_SERVICE_ROLE_KEY: "short" } }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY is invalid/);
  });

  it("applies declared defaults", () => {
    const { NODE_ENV: _n, HL_BOS_ENV: _h, ...withoutDefaults } = validEnv;
    const env = loadEnv({ source: withoutDefaults });
    expect(env.HL_BOS_ENV).toBe("local");
  });
});

describe("loadEnv in browser mode", () => {
  // The load-bearing test for this package: browser mode must not surface a
  // server-only value even when it IS present in the source.
  it("omits every server-side variable", () => {
    const env = loadEnv({ source: validEnv, browser: true });
    for (const spec of ENV_SPEC) {
      if (isServerSide(spec.classification)) {
        expect(env[spec.key], `${spec.key} leaked to browser`).toBeUndefined();
      }
    }
  });

  it("does not leak the service-role key", () => {
    const env = loadEnv({ source: validEnv, browser: true });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain("sb_secret");
  });

  it("still provides browser-safe variables", () => {
    const env = loadEnv({ source: validEnv, browser: true });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example-ref.supabase.co");
  });

  // A browser build must not fail because a server secret is absent -- that
  // would push operators toward defining secrets in browser environments.
  it("succeeds when server-only variables are entirely absent", () => {
    const browserOnly = {
      NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    };
    expect(() => loadEnv({ source: browserOnly, browser: true })).not.toThrow();
  });
});

describe("requireServerEnv", () => {
  const g = globalThis as { window?: unknown };

  afterEach(() => {
    delete g.window;
  });

  it("returns a server-only value in a server context", () => {
    expect(requireServerEnv("SUPABASE_SERVICE_ROLE_KEY", { source: validEnv })).toBe(
      validEnv.SUPABASE_SERVICE_ROLE_KEY,
    );
  });

  // The runtime backstop. If the bundler config and the ESLint rule have both
  // failed, this is the last thing between a service-role key and the client.
  it("throws when a server-only value is read in a browser context", () => {
    g.window = {};
    expect(() =>
      requireServerEnv("SUPABASE_SERVICE_ROLE_KEY", { source: validEnv }),
    ).toThrow(ConfigClassificationError);
  });

  it("names the secret-exposure bug explicitly", () => {
    g.window = {};
    expect(() =>
      requireServerEnv("SUPABASE_SERVICE_ROLE_KEY", { source: validEnv }),
    ).toThrow(/secret-exposure bug/);
  });

  it("allows browser-safe values in a browser context", () => {
    g.window = {};
    expect(() =>
      requireServerEnv("NEXT_PUBLIC_SUPABASE_URL", { source: validEnv }),
    ).not.toThrow();
  });

  it("rejects a key that is not declared in ENV_SPEC", () => {
    expect(() =>
      // @ts-expect-error -- deliberately undeclared key
      requireServerEnv("TOTALLY_MADE_UP_KEY", { source: validEnv }),
    ).toThrow(/not declared in ENV_SPEC/);
  });
});

describe("describeEnv", () => {
  it("describes every declared variable", () => {
    expect(describeEnv()).toHaveLength(ENV_SPEC.length);
  });

  it("exposes no values, only metadata", () => {
    expect(JSON.stringify(describeEnv())).not.toContain(
      "sb_secret_fake_value_for_tests_only",
    );
  });
});

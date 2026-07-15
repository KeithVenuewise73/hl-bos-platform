import { z } from "zod";
import {
  assertClassification,
  ConfigClassificationError,
  isServerSide,
  type Classification,
} from "./classification.js";

/** A single declared environment variable. */
export interface EnvVarSpec<T = unknown> {
  /** Process env key. */
  readonly key: string;
  /** Where this variable may be read. Enforced, not advisory. */
  readonly classification: Classification;
  /** Zod schema. Also documents the expected shape. */
  readonly schema: z.ZodType<T>;
  /** Why this variable exists. Surfaced in generated .env.example. */
  readonly description: string;
  /** Placeholder for .env.example. MUST NOT be a real value. */
  readonly example: string;
}

/** Deployment environments, per the brief's environment management section. */
export const environmentSchema = z.enum(["local", "preview", "staging", "production"]);
export type Environment = z.infer<typeof environmentSchema>;

/**
 * The HL-BOS environment contract.
 *
 * Phase 1 declares only what Phase 1 actually needs. Variables are added by
 * the phase that introduces the capability requiring them -- declaring
 * STRIPE_SECRET_KEY before billing exists would be documentation theatre and
 * would force operators to populate variables that do nothing.
 */
export const ENV_SPEC = [
  {
    key: "NODE_ENV",
    classification: "server-only",
    schema: z.enum(["development", "test", "production"]).default("development"),
    description: "Node runtime mode. Set by tooling, not by operators.",
    example: "development",
  },
  {
    key: "HL_BOS_ENV",
    classification: "server-only",
    schema: environmentSchema.default("local"),
    description:
      "Which HL-BOS deployment environment this process belongs to. Distinct from NODE_ENV: a preview deploy is NODE_ENV=production but HL_BOS_ENV=preview.",
    example: "local",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    classification: "browser-safe",
    schema: z.url({ error: "must be a valid URL, e.g. https://<ref>.supabase.co" }),
    description:
      "Supabase project URL. Genuinely public -- it is in every client request.",
    example: "https://your-project-ref.supabase.co",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    classification: "browser-safe",
    schema: z.string().min(20, "looks too short to be a Supabase key"),
    description:
      "Supabase publishable (anon) key. Browser-visible by design. This key is NOT a security boundary -- RLS is. Anything reachable with this key is reachable by the public internet.",
    example: "sb_publishable_xxxxxxxxxxxxxxxxxxxxxx",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    classification: "server-only",
    schema: z.string().min(20, "looks too short to be a Supabase key"),
    description:
      "Supabase service-role key. BYPASSES ALL ROW LEVEL SECURITY. Server-only, always. Never import into a client component. Never prefix with NEXT_PUBLIC. If this reaches a browser bundle, every tenant's data is readable by every visitor.",
    example: "sb_secret_xxxxxxxxxxxxxxxxxxxxxx",
  },
] as const satisfies readonly EnvVarSpec[];

export type EnvKey = (typeof ENV_SPEC)[number]["key"];

/** Raised when the environment does not satisfy the contract. */
export class EnvValidationError extends Error {
  public override readonly name = "EnvValidationError";
  public readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Environment validation failed:\n${issues.map((i) => `  - ${i}`).join("\n")}\n\n` +
        `See .env.example and docs/operations/environment-variables.md.`,
    );
    this.issues = issues;
  }
}

export interface LoadOptions {
  /** Source of values. Defaults to process.env. Injectable for tests. */
  readonly source?: Record<string, string | undefined>;
  /**
   * When true, only browser-safe variables are read and server-side
   * variables are omitted from the result entirely.
   */
  readonly browser?: boolean;
}

export type LoadedEnv = Partial<Record<EnvKey, unknown>>;

/**
 * True when running in a browser-like environment.
 *
 * Probes `globalThis` rather than referencing `window` directly: this package
 * is consumed by both server and client code, so it must typecheck without
 * the DOM lib. Pulling in "dom" to satisfy one `typeof` would hand every
 * consumer of this package DOM globals it should not have.
 */
function inBrowserContext(): boolean {
  return typeof (globalThis as { window?: unknown }).window !== "undefined";
}

/**
 * Validate and load the environment.
 *
 * Fails fast and reports *every* problem at once rather than one per run --
 * an operator configuring a new environment should get the whole list on the
 * first attempt, not discover them one boot at a time.
 *
 * @throws {ConfigClassificationError} if a spec contradicts itself (a bug).
 * @throws {EnvValidationError} if the environment does not satisfy the spec.
 */
export function loadEnv(options: LoadOptions = {}): LoadedEnv {
  const source = options.source ?? process.env;
  const browser = options.browser ?? false;

  const issues: string[] = [];
  const result: Record<string, unknown> = {};

  for (const spec of ENV_SPEC) {
    // A misclassified spec is a programming error, not an operator error.
    // Surface it immediately and unconditionally -- including on the browser
    // path, where the consequence is a leaked secret.
    assertClassification(spec.key, spec.classification);

    if (browser && isServerSide(spec.classification)) {
      continue;
    }

    const raw = source[spec.key];
    const parsed = spec.schema.safeParse(raw);

    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => i.message).join("; ");
      issues.push(
        raw === undefined
          ? `${spec.key} is not set (${spec.classification}). ${spec.description}`
          : `${spec.key} is invalid: ${detail}`,
      );
      continue;
    }

    result[spec.key] = parsed.data;
  }

  if (issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  return result;
}

/**
 * Read a single server-side variable.
 *
 * Throws if called in a browser context. This is defence in depth: the bundler
 * should already have excluded it, the ESLint rule should already have flagged
 * it, and this is the runtime backstop for when both are wrong.
 */
export function requireServerEnv(key: EnvKey, options: LoadOptions = {}): unknown {
  const spec = ENV_SPEC.find((s) => s.key === key);
  if (!spec) {
    throw new EnvValidationError([`${key} is not declared in ENV_SPEC.`]);
  }

  if (isServerSide(spec.classification) && inBrowserContext()) {
    throw new ConfigClassificationError(
      `"${key}" is "${spec.classification}" and was read in a browser ` +
        `context. This is a secret-exposure bug. Read it in a server ` +
        `component, route handler, or Edge Function instead.`,
    );
  }

  const env = loadEnv(options);
  return env[key];
}

/** Every variable an operator must supply, for docs and .env.example. */
export function describeEnv(): readonly {
  key: string;
  classification: Classification;
  description: string;
  example: string;
}[] {
  return ENV_SPEC.map((s) => ({
    key: s.key,
    classification: s.classification,
    description: s.description,
    example: s.example,
  }));
}

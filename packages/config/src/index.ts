/**
 * @hl-bos/config — validated, classified environment configuration.
 *
 * This package is the only sanctioned reader of `process.env` in HL-BOS.
 * The ESLint rule `no-restricted-properties` blocks direct access everywhere
 * else and points here.
 *
 * Responsibility:
 *   - Declare every environment variable the platform consumes
 *   - Validate them with Zod at startup, reporting all failures at once
 *   - Classify each as browser-safe / server-only / ci-only /
 *     supabase-secret / provider-secret, and enforce that classification
 *
 * Non-responsibility: this package does not store, fetch or decrypt secret
 * *values*. Provider credentials live in Supabase Vault and are referenced
 * by key -- see docs/security/threat-model.md.
 */

export {
  loadEnv,
  requireServerEnv,
  describeEnv,
  environmentSchema,
  EnvValidationError,
  ENV_SPEC,
  type Environment,
  type EnvKey,
  type EnvVarSpec,
  type LoadOptions,
  type LoadedEnv,
} from "./env.js";

export {
  assertClassification,
  isServerSide,
  ConfigClassificationError,
  BROWSER_PREFIX,
  SERVER_SIDE_CLASSIFICATIONS,
  type Classification,
} from "./classification.js";

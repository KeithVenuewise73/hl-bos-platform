// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/**
 * HL-BOS flat ESLint config (ESLint 10).
 *
 * The custom rules below are not style preferences. Each one encodes a
 * security or architecture rule from the Core v1 brief that is otherwise
 * only enforced by human review -- and human review does not scale to
 * every PR across every vertical.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/out/**", // Next.js static-export output (build artifact)
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "supabase/functions/**", // Deno runtime, different lint target
      "scripts/local-test/**", // local pgTAP runners: plain CommonJS, not part of the TS build
      "apps/*/preview/**", // self-contained static preview artifacts (vanilla browser HTML/JS), not part of the TS build
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Config files (vitest.config.ts and friends) are not members of any
          // package tsconfig. Without this they fail to parse and lint reports a
          // false error on a file that is perfectly fine. Cover both the repo
          // root and one level down (per-app / per-package config files).
          allowDefaultProject: [
            "*.config.ts",
            "*.config.mts",
            "apps/*/*.config.ts",
            "apps/*/*.config.mts",
            "packages/*/*.config.ts",
            "packages/*/*.config.mts",
          ],
          // One default-project config file per app/package (next/vitest configs)
          // plus the repo root; the default cap of 8 is exceeded as the workspace
          // grows. These files are tiny, so the lint cost is negligible.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 30,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ---------------------------------------------------------------------
  // Platform security rules
  // ---------------------------------------------------------------------
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Unused vars are allowed only when explicitly marked with _.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // `any` erases the type safety we rely on for tenant scoping.
      "@typescript-eslint/no-explicit-any": "error",

      // Floating promises in a workflow engine mean silently dropped steps
      // and dishonest run status. This must be an error, never a warning.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Enforces the platform's provider-neutral + secret-handling rules.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_.*(SECRET|KEY|TOKEN|PASSWORD)/]",
          message:
            "Secrets must never be exposed to the browser. NEXT_PUBLIC_ is browser-visible; a secret behind it is a leaked secret. Use a server-only variable and read it in a server component, route handler or Edge Function.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='SUPABASE_SERVICE_ROLE_KEY']",
          message:
            "Do not read SUPABASE_SERVICE_ROLE_KEY directly -- it bypasses RLS and must never reach a browser bundle. Use the audited server client factory from @hl-bos/database.",
        },
      ],

      // Direct env access defeats the validated, classified config layer.
      // @hl-bos/config is the only sanctioned reader (see its own override).
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read configuration from @hl-bos/config, which validates and classifies every variable at startup. Direct process.env access bypasses validation and the browser-safe/server-only classification.",
        },
      ],
    },
  },

  // @hl-bos/config is the one place allowed to touch process.env --
  // it is the module whose entire job is to read and validate it.
  {
    files: ["packages/config/src/**/*.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },

  // Config files and tests run in Node with looser needs.
  {
    files: ["**/*.config.{ts,mts,mjs,js}", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "no-restricted-properties": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  // The HL-BTI app's Supabase config boundary is the ONE place in that app
  // allowed to read process.env directly. A Next.js static export inlines only
  // literal `process.env.NEXT_PUBLIC_*` dot-access at build time; reading the
  // same values dynamically through @hl-bos/config's loadEnv() would NOT be
  // inlined and would be `undefined` in the browser bundle. Both values here are
  // browser-safe by the platform's own ENV_SPEC (the publishable/anon key is
  // documented as public and gated by RLS, not by secrecy), so exposing them is
  // correct, not a leak. Scoped to this single file to keep the guard everywhere else.
  {
    files: ["apps/hl-bti/src/lib/supabase.ts"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },

  // The Executive Portal's env boundary: the specific files that must read
  // runtime/build env directly. NEXT_PUBLIC_* must be literal dot-access to be
  // inlined; the publishable key is browser-safe by ENV_SPEC (RLS is the
  // boundary, not secrecy). Session/middleware also read NODE_ENV/HL_BOS_ENV/
  // PORTAL_DEV_ROLE to gate the (production-impossible) local dev role. Scoped
  // to these files to keep the guard everywhere else.
  {
    files: [
      "apps/executive-portal/src/lib/session.ts",
      "apps/executive-portal/src/lib/browser.ts",
      "apps/executive-portal/src/middleware.ts",
      "apps/executive-portal/src/app/api/health/route.ts",
    ],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },

  // Herman Legacy Digital's env boundary — same rationale as the Executive
  // Portal. Only the auth/session, middleware, browser client, health check, the
  // intake delivery adapter and the analytics sink read env directly; scoped to
  // these files so the guard holds everywhere else. Publishable key only; no
  // service-role key is read anywhere.
  {
    files: [
      "apps/herman-legacy-digital/src/lib/session.ts",
      "apps/herman-legacy-digital/src/lib/browser.ts",
      "apps/herman-legacy-digital/src/lib/persist.ts",
      "apps/herman-legacy-digital/src/lib/btdi-persist.ts",
      "apps/herman-legacy-digital/src/middleware.ts",
      "apps/herman-legacy-digital/src/app/api/health/route.ts",
      "apps/herman-legacy-digital/src/app/api/event/route.ts",
    ],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },

  // Herman Legacy Venture Studio (HLVS V2) env boundary — same rationale as the
  // Executive Portal. Only the auth/session, middleware, browser client and
  // health check read env directly; scoped to these files. Publishable key only;
  // no service-role key is read anywhere.
  {
    files: [
      "apps/venture-studio/src/lib/session.ts",
      "apps/venture-studio/src/lib/browser.ts",
      "apps/venture-studio/src/middleware.ts",
      "apps/venture-studio/src/app/api/health/route.ts",
    ],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },

  {
    files: ["**/*.{mjs,js}"],
    ...tseslint.configs.disableTypeChecked,
  },

  // Standalone Node scripts (governance/CI helpers) run in Node, not the
  // browser or the TS build. Give them Node globals so no-undef does not fire
  // on process/console. They still get the security lint via the shared rules.
  {
    files: ["scripts/**/*.{mjs,js}"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
      },
    },
  },

  // Must stay last: turns off rules that conflict with Prettier.
  prettier,
);

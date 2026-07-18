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
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "supabase/functions/**", // Deno runtime, different lint target
      "scripts/local-test/**", // local pgTAP runners: plain CommonJS, not part of the TS build
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

  // The remote-safety boundary, enforced.
  //
  // apps/cloud is the HOSTED execution plane. It must expose only operations
  // that are safe to perform remotely. Shell execution, OS access and the
  // operator-plane toolchain stay in apps/control-center. A shell-out import
  // here fails the build, so the boundary cannot erode by accident. Promoting a
  // privileged action to the cloud is a deliberate redesign behind an
  // authenticated API -- not an unnoticed import.
  {
    files: ["apps/cloud/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "child_process",
              message:
                "The hosted cloud plane must not shell out. Shell execution stays in the local operator plane (Headquarters). See the remote-safety boundary.",
            },
            {
              name: "node:child_process",
              message:
                "The hosted cloud plane must not shell out. Shell execution stays in the local operator plane (Headquarters). See the remote-safety boundary.",
            },
          ],
          patterns: [
            {
              group: ["**/control-center/**"],
              message:
                "The cloud plane must not import operator-plane modules. Share code through @hl-bos/* packages instead.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["**/*.{mjs,js}"],
    ...tseslint.configs.disableTypeChecked,
  },

  // Must stay last: turns off rules that conflict with Prettier.
  prettier,
);

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const APPS = path.join(REPO_ROOT, "apps");

/**
 * The guard for a bug that reached production.
 *
 * apps/barbershop shipped a Content-Security-Policy of `script-src 'self'`,
 * copied from another app in this repository. Next's App Router hydrates
 * through INLINE `self.__next_f.push(...)` scripts, and a policy naming neither
 * a nonce nor 'unsafe-inline' blocks every one of them. The HTML is rendered on
 * the server, so the page looked perfect and was completely dead: no button had
 * a handler, and the sign-in form fell through to a native submit that reloaded
 * the page.
 *
 * Nothing caught it -- not the build, the typecheck, the test suite, the
 * deployment log, or a check that the page returned 200 with the form in it.
 * Serving a form is not the same as the form working, and the only signal was a
 * person clicking the button.
 *
 * So the rule is asserted here, across every app at once, because the failure
 * mode is silent and the fix is easy to forget in the next app.
 */
function appsWithSource(): string[] {
  if (!fs.existsSync(APPS)) return [];
  return fs
    .readdirSync(APPS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/** Every file in an app that could plausibly define a CSP. */
function cspFiles(app: string): string[] {
  const candidates = [
    "next.config.ts",
    "next.config.mjs",
    "next.config.js",
    "src/middleware.ts",
    "src/proxy.ts",
    "src/lib/csp.ts",
  ];
  return candidates.map((c) => path.join(APPS, app, c)).filter((f) => fs.existsSync(f));
}

/**
 * Every `script-src ...` directive found in the file.
 *
 * Read to the end of the LINE (trimmed at a `;`) rather than to the next quote:
 * these policies are written as template literals full of `'self'` and
 * `'nonce-${nonce}'`, so stopping at the first quote captures the two words
 * `script-src` and nothing else -- which is how the first version of this test
 * managed to fail on files that were already correct.
 */
function scriptSrcDirectives(source: string): string[] {
  return [...withoutComments(source).matchAll(/script-src[^\n]*/g)].map((m) => {
    const d = m[0];
    const end = d.indexOf(";");
    return end === -1 ? d : d.slice(0, end);
  });
}

/**
 * Code only, never prose.
 *
 * Each of these files EXPLAINS the bug in a comment, quoting the broken
 * `script-src 'self'` -- so the first version of this test failed on five files
 * that were all correct, by reading the warning as the offence. Comment lines
 * are dropped wholesale rather than stripped from `//` onward, because a real
 * policy line contains `https://` and would be truncated by the naive version.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

describe("no app may ship a policy that blocks its own hydration", () => {
  const apps = appsWithSource();

  it("finds apps to check", () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  for (const app of apps) {
    for (const file of cspFiles(app)) {
      const rel = path.relative(REPO_ROOT, file);
      const source = fs.readFileSync(file, "utf8");
      const directives = scriptSrcDirectives(source);
      if (directives.length === 0) continue;

      it(`${rel} permits Next's inline bootstrap`, () => {
        for (const d of directives) {
          // A nonce is the right answer; 'unsafe-inline' is the blunt one. One
          // of them has to be there, or the app renders and does nothing.
          expect(
            d.includes("nonce-") || d.includes("'unsafe-inline'"),
            `${rel} has "${d.trim()}", which blocks Next's inline hydration scripts. ` +
              `The page will render perfectly and no button will work. Use a ` +
              `per-request nonce from the middleware -- see apps/barbershop/src/lib/csp.ts.`,
          ).toBe(true);
        }
      });
    }
  }
});

describe("an app that mints a nonce must render per request", () => {
  for (const app of appsWithSource()) {
    const csp = path.join(APPS, app, "src/lib/csp.ts");
    if (!fs.existsSync(csp)) continue;
    const layout = path.join(APPS, app, "src/app/layout.tsx");
    if (!fs.existsSync(layout)) continue;

    it(`${app} forces dynamic rendering at the root layout`, () => {
      // A statically prerendered page's HTML is built before any nonce exists,
      // so it ships with a policy naming a nonce none of its scripts carry.
      expect(
        fs.readFileSync(layout, "utf8"),
        `apps/${app} builds a nonce but its root layout does not force dynamic ` +
          `rendering, so any statically prerendered page in it is dead on arrival.`,
      ).toContain('export const dynamic = "force-dynamic"');
    });
  }
});

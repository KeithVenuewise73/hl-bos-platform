// Which parts of a site changed between two specs. This MIRRORS the comparison
// in sitegen.save_version (migration 0060), which decides what a non-staff
// caller may save. If you change one, change the other and the pinned cases in
// scopes.test.ts (which come from supabase/tests/60_sitegen.sql).
//
//   theme      <- (spec->'theme')        is distinct from base
//   profile    <- (spec->'profile')      is distinct from base
//   heroChoice <- (spec #> '{hero,choice}') is distinct from base
//   content    <- (spec - theme - profile - hero) is distinct from base, OR
//                 ((spec->'hero') - 'choice') is distinct from base's
//
// Comparison is jsonb equality: object key order is irrelevant, array order
// matters, a missing key is NOT the same as an explicit null (SQL NULL versus
// jsonb 'null').

export type Scope = "theme" | "profile" | "heroChoice" | "content";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** jsonb-style deep equality. `undefined` means "absent" (SQL NULL). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => jsonEqual(x, b[i]));
  }
  if (isObj(a) || isObj(b)) {
    if (!isObj(a) || !isObj(b)) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
  }
  return a === b;
}

/** jsonb `-` operator: the object without the given keys; non-objects pass through. */
function without(v: unknown, ...keys: string[]): unknown {
  if (!isObj(v)) return v;
  const out: Obj = {};
  for (const [k, val] of Object.entries(v)) if (!keys.includes(k)) out[k] = val;
  return out;
}

const get = (v: unknown, k: string): unknown => (isObj(v) ? v[k] : undefined);

export function changedScopes(base: unknown, next: unknown): Scope[] {
  const out: Scope[] = [];
  if (!jsonEqual(get(next, "theme"), get(base, "theme"))) out.push("theme");
  if (!jsonEqual(get(next, "profile"), get(base, "profile"))) out.push("profile");
  const choice = (s: unknown) => get(get(s, "hero"), "choice");
  if (!jsonEqual(choice(next), choice(base))) out.push("heroChoice");
  const topDiffers = !jsonEqual(
    without(next, "theme", "profile", "hero"),
    without(base, "theme", "profile", "hero"),
  );
  const heroDiffers = !jsonEqual(
    without(get(next, "hero"), "choice"),
    without(get(base, "hero"), "choice"),
  );
  if (topDiffers || heroDiffers) out.push("content");
  return out;
}

/** Scopes a free-plan client may edit (sitegen.edit_theme / edit_profile / edit_hero). */
export const CLIENT_SCOPES: readonly Scope[] = ["theme", "profile", "heroChoice"];

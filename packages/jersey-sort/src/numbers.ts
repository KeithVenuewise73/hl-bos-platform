/**
 * Jersey number text: what counts as one, and its one canonical spelling.
 *
 * Numbers are kept as TEXT, not integers, because "0" and "00" are different
 * jerseys in football and basketball, and an integer column cannot tell them
 * apart. Everything else is canonicalised: "#24", " 24 ", "No. 24" are 24, and
 * "07" is 7 (nobody's gallery should split in two over a leading zero).
 */

const CANONICAL = /^(?:\d|[1-9]\d|00)$/;

/** True for "0".."99" and "00" exactly as stored. */
export function isCanonicalJerseyNumber(value: string): boolean {
  return CANONICAL.test(value);
}

/**
 * Canonical form of something a person typed or a provider read, or `null`
 * when it is not a jersey number at all (three digits, letters, empty).
 */
export function normalizeJerseyNumber(raw: string): string | null {
  const stripped = raw
    .trim()
    .replace(/^(?:no\.?|number|#)\s*/i, "")
    .replace(/\s+/g, "");
  if (!/^\d{1,2}$/.test(stripped)) return null;
  if (stripped === "00") return "00";
  return String(Number(stripped));
}

/** Sort order for galleries: 0, 00, 1, 2, … 99. */
export function compareJerseyNumbers(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (na !== nb) return na - nb;
  return a.length - b.length;
}

// Title filters. These run before a single token is spent, so a bug here is
// either wasted money (too loose) or a job you never see (too tight).
//
// SEPARATE from filters.ts on purpose: filters.ts reaches geo.ts, which
// carries a generated 284KB postal gazetteer. Ingest needs the TITLE rules,
// and dragging the gazetteer in for that is how the discovery function got
// killed with WORKER_RESOURCE_LIMIT.
//
// Matching is WHOLE-WORD on purpose: the original substring list had
// "associate " with a trailing space, which never matches a title *ending* in
// "Associate".

export const TITLE_INCLUDE = [
  "operations", "operation", "plant", "production", "warehouse", "distribution",
  "logistics", "supply chain", "transportation", "fleet", "dispatch",
  "general manager", "site manager", "branch manager", "market manager",
  "area manager", "regional manager", "district manager",
  "senior manager", "sr manager", "sr. manager", "head of", "chief",
  "vice president", "senior director", "executive director",
  "facility", "facilities", "field service", "service manager", "terminal",
  "director", "president", "chief operating",
  "continuous improvement", "process improvement", "3pl", "last mile",
  "final mile", "delivery", "shipping", "receiving", "inventory",
  "route", "carrier", "depot",
];

// Short/ambiguous terms that need boundaries on BOTH sides — left-bounded
// "hub" matches "Hubbard", "vp" matches "VPN".
export const TITLE_INCLUDE_EXACT = [
  "vp", "coo", "gm", "hub", "dsd", "dc", "mgr", "ops", "svp", "avp",
];

// These beat the exclusion list. "Driver Manager" is a transportation
// management job, not a driving job.
export const TITLE_RESCUE = [
  "driver manager", "driver supervisor", "driver lead",
  "associate director", "associate vice president",
];

export const TITLE_EXCLUDE = [
  "warehouse worker", "warehouse associate", "warehouse clerk",
  "warehouse lead", "warehouse team lead", "dock lead", "line lead",
  "material handler", "load operator", "forklift", "order selector",
  "1st shift", "2nd shift", "3rd shift", "stockroom", "stocker",
  "assistant manager", "assistant director", "associate manager",
  "shift supervisor", "shift lead", "shift manager", "team lead",
  "crew lead", "crew leader", "trainee", "management trainee",
  "intern", "internship", "associate", "clerk", "driver", "cdl",
  "technician", "engineer i", "software", "nurse", "rn", "physician",
  "sales representative", "cashier", "part-time", "part time", "seasonal",
  "loader", "unloader", "picker", "packer", "custodian", "janitor",
  "entry level", "apprentice", "co-op",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const EXCLUDE_RE = new RegExp(`\\b(?:${TITLE_EXCLUDE.map(esc).join("|")})\\b`, "i");
const INCLUDE_RE = new RegExp(`\\b(?:${TITLE_INCLUDE.map(esc).join("|")})`, "i");
const INCLUDE_EXACT_RE = new RegExp(`\\b(?:${TITLE_INCLUDE_EXACT.map(esc).join("|")})\\b`, "i");
const RESCUE_RE = new RegExp(`\\b(?:${TITLE_RESCUE.map(esc).join("|")})\\b`, "i");

/**
 * A title must name a LEVEL, not just a function.
 *
 * The include list carries broad function words — "warehouse", "shipping",
 * "logistics", "inventory" — which are right inside "Warehouse Manager" and
 * wrong on their own. Requiring a level word is one rule, and it is the actual
 * target: Senior Manager / Director and up.
 */
const SENIORITY_RE =
  /\b(manager|mgr|managing|director|head|chief|officer|president|vp|svp|avp|coo|gm|superintendent|supervisor|executive|principal|lead|leader)\b/i;

export function titleOk(t: string | null | undefined): boolean {
  const s = t ?? "";
  if (RESCUE_RE.test(s)) return true;          // rescue beats exclude
  if (EXCLUDE_RE.test(s)) return false;
  if (!SENIORITY_RE.test(s)) return false;     // function without a level
  return INCLUDE_RE.test(s) || INCLUDE_EXACT_RE.test(s);
}

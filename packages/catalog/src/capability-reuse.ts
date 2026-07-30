/**
 * The anti-duplication gate: deterministic duplicate detection + the reuse
 * decision contract (Phase XI-1).
 *
 * This is what makes "reuse before rebuild" enforceable. Given a PROPOSED
 * capability, it compares against the canonical Capability Library using only
 * deterministic factors (names, aliases, domain, type, functional-purpose token
 * overlap, technical implementation, industries) and returns a structured
 * verdict + a reuse recommendation that HLVS Intelligence, HL-BTI, the Software
 * Factory and the Claude Build Queue can call before recommending new work.
 *
 * AI IS NOT THE AUTHORITY. No model call happens here; tests need no AI. A future
 * phase may add advisory semantic analysis through the AI gateway, but the
 * deterministic verdict remains authoritative.
 */

import {
  CAPABILITIES,
  capabilityByAlias,
  type Capability,
  type CapabilityType,
  type CapabilityDomain,
} from "./capabilities";

export type DuplicateVerdict =
  | "REUSE_EXISTING"
  | "EXTEND_EXISTING"
  | "CONSOLIDATE_DUPLICATES"
  | "POSSIBLE_OVERLAP"
  | "BUILD_NEW"
  | "MANUAL_REVIEW_REQUIRED";

export type ReasonCode =
  | "EXACT_ALIAS_MATCH"
  | "DOMAIN_MATCH"
  | "TYPE_MATCH"
  | "FUNCTIONAL_OVERLAP"
  | "TECHNICAL_OVERLAP"
  | "INDUSTRY_OVERLAP"
  | "MULTIPLE_EXACT_MATCHES"
  | "AMBIGUOUS_SIGNALS"
  | "NO_SIGNIFICANT_MATCH";

export interface ProposedCapability {
  name: string;
  aliases?: string[];
  type?: CapabilityType;
  domain?: CapabilityDomain;
  /** Free-text description of what the capability does. */
  functionalPurpose?: string;
  technical?: { schema?: string; package?: string };
  industries?: string[];
  dependsOn?: string[];
}

export interface CapabilityMatch {
  capabilityId: string;
  displayName: string;
  score: number; // 0-100
  reasons: ReasonCode[];
}

export interface DuplicateCheckResult {
  verdict: DuplicateVerdict;
  /** Best match score, 0-100. */
  score: number;
  matches: CapabilityMatch[];
  reasonCodes: ReasonCode[];
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "to",
  "with",
  "management",
  "system",
  "engine",
  "capability",
  "service",
  "platform",
]);

function tokens(...parts: (string | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const p of parts) {
    if (!p) continue;
    for (const raw of p.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length >= 3 && !STOP.has(raw)) {
        // Deterministic light stem: collapse morphological variants by their
        // 6-char prefix (schedule/scheduling → "schedu"; resource/resources →
        // "resour"), so overlap detection isn't fooled by suffixes.
        out.add(raw.length > 6 ? raw.slice(0, 6) : raw);
      }
    }
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function aliasSet(c: Capability): Set<string> {
  return new Set([c.id, c.canonicalName, ...c.aliases].map((s) => s.toLowerCase()));
}

function scoreAgainst(p: ProposedCapability, c: Capability): CapabilityMatch {
  const reasons: ReasonCode[] = [];
  let score = 0;

  // Exact alias/name match (the strongest deterministic signal).
  const proposedKeys = [p.name, ...(p.aliases ?? [])].map((s) => s.toLowerCase());
  const cAliases = aliasSet(c);
  if (proposedKeys.some((k) => cAliases.has(k))) {
    score += 60;
    reasons.push("EXACT_ALIAS_MATCH");
  }

  // Functional-purpose / name token overlap.
  const pTok = tokens(p.name, p.functionalPurpose, ...(p.aliases ?? []));
  const cTok = tokens(c.canonicalName, c.displayName, c.description, ...c.aliases);
  const j = jaccard(pTok, cTok);
  if (j > 0) {
    const add = Math.round(j * 45);
    if (add > 0) {
      score += add;
      if (j >= 0.2) reasons.push("FUNCTIONAL_OVERLAP");
    }
  }

  if (p.domain && p.domain === c.domain) {
    score += 10;
    reasons.push("DOMAIN_MATCH");
  }
  if (p.type && p.type === c.type) {
    score += 5;
    reasons.push("TYPE_MATCH");
  }
  const schemaHit = p.technical?.schema && p.technical.schema === c.schema;
  const packageHit = p.technical?.package && p.technical.package === c.package;
  if (schemaHit || packageHit) {
    score += 10;
    reasons.push("TECHNICAL_OVERLAP");
  }
  const pInd = new Set((p.industries ?? []).map((s) => s.toLowerCase()));
  if ([...pInd].some((i) => i !== "all" && c.industries.includes(i))) {
    score += 5;
    reasons.push("INDUSTRY_OVERLAP");
  }

  return {
    capabilityId: c.id,
    displayName: c.displayName,
    score: Math.min(100, score),
    reasons,
  };
}

/** Deterministic duplicate check of a proposed capability against the library. */
export function duplicateCheck(p: ProposedCapability): DuplicateCheckResult {
  const scored = CAPABILITIES.map((c) => scoreAgainst(p, c))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.capabilityId.localeCompare(b.capabilityId));

  const exact = scored.filter((m) => m.reasons.includes("EXACT_ALIAS_MATCH"));
  const best = scored[0]?.score ?? 0;
  const matches = scored.slice(0, 5);

  let verdict: DuplicateVerdict;
  const reasonCodes: ReasonCode[] = [];

  if (exact.length >= 2) {
    verdict = "CONSOLIDATE_DUPLICATES";
    reasonCodes.push("MULTIPLE_EXACT_MATCHES");
  } else if (exact.length === 1) {
    verdict = "REUSE_EXISTING";
    reasonCodes.push("EXACT_ALIAS_MATCH");
  } else if (best >= 55) {
    verdict = "EXTEND_EXISTING";
    reasonCodes.push(...(matches[0]?.reasons ?? []));
  } else if (best >= 35) {
    verdict = "POSSIBLE_OVERLAP";
    reasonCodes.push(...(matches[0]?.reasons ?? []));
  } else if (best >= 20) {
    verdict = "MANUAL_REVIEW_REQUIRED";
    reasonCodes.push("AMBIGUOUS_SIGNALS");
  } else {
    verdict = "BUILD_NEW";
    reasonCodes.push("NO_SIGNIFICANT_MATCH");
  }

  return { verdict, score: best, matches, reasonCodes: [...new Set(reasonCodes)] };
}

// ==========================================================================
// Reuse decision contract — what downstream systems call
// ==========================================================================

export interface ReuseDecision {
  existsRelated: boolean;
  bestMatches: CapabilityMatch[];
  matchScore: number;
  recommendedAction: DuplicateVerdict;
  reasonCodes: ReasonCode[];
  /** Capability ids the proposed work would depend on (from the best match + proposal). */
  dependencies: string[];
  risks: string[];
  requiredHumanReview: boolean;
  /** True ONLY when the deterministic verdict is genuinely new work. */
  mayEnterBuildQueue: boolean;
}

const SAFE_TO_REUSE = new Set<DuplicateVerdict>(["REUSE_EXISTING", "EXTEND_EXISTING"]);

/** The single call HLVS/HL-BTI/Factory/Build-Queue make before proposing new work. */
export function evaluateReuse(p: ProposedCapability): ReuseDecision {
  const dc = duplicateCheck(p);
  const top = dc.matches[0];
  const topCap = top ? CAPABILITIES.find((c) => c.id === top.capabilityId) : undefined;

  const dependencies = [
    ...new Set([...(topCap?.dependsOn ?? []), ...(p.dependsOn ?? [])]),
  ];

  const risks: string[] = [];
  if (dc.verdict === "CONSOLIDATE_DUPLICATES") {
    risks.push(
      "Multiple registries define this capability; consolidate to prevent divergence.",
    );
  }
  if (dc.verdict === "EXTEND_EXISTING") {
    risks.push(
      "Extends an existing capability; coordinate with its owner to avoid a fork.",
    );
  }
  if (dc.verdict === "POSSIBLE_OVERLAP" || dc.verdict === "MANUAL_REVIEW_REQUIRED") {
    risks.push(
      "Signals are ambiguous; a human must confirm this is not a hidden duplicate.",
    );
  }
  if (dc.verdict === "BUILD_NEW") {
    risks.push(
      "New capability increases platform surface area; confirm no near-duplicate exists.",
    );
  }
  if (topCap && topCap.maturity === "planned") {
    risks.push(
      "Best match is PLANNED (not implemented); reuse depends on it being built first.",
    );
  }

  return {
    existsRelated: dc.matches.length > 0 && dc.verdict !== "BUILD_NEW",
    bestMatches: dc.matches,
    matchScore: dc.score,
    recommendedAction: dc.verdict,
    reasonCodes: dc.reasonCodes,
    dependencies,
    risks,
    requiredHumanReview: !SAFE_TO_REUSE.has(dc.verdict),
    mayEnterBuildQueue: dc.verdict === "BUILD_NEW",
  };
}

export interface RegisterCheck {
  ok: boolean;
  verdict: DuplicateVerdict;
  reason: string;
}

/**
 * The guard that prevents an EXACT duplicate from silently entering the canonical
 * library. A proposal that resolves to REUSE_EXISTING or CONSOLIDATE_DUPLICATES
 * must not be admitted as a new capability — it must reuse or consolidate.
 */
export function canRegister(p: ProposedCapability): RegisterCheck {
  const dc = duplicateCheck(p);
  if (dc.verdict === "REUSE_EXISTING") {
    return {
      ok: false,
      verdict: dc.verdict,
      reason: `"${p.name}" already exists as "${dc.matches[0]?.displayName}". Reuse it, do not re-register.`,
    };
  }
  if (dc.verdict === "CONSOLIDATE_DUPLICATES") {
    return {
      ok: false,
      verdict: dc.verdict,
      reason: `"${p.name}" matches multiple existing capabilities. Consolidate them before registering.`,
    };
  }
  return {
    ok: true,
    verdict: dc.verdict,
    reason: "No exact duplicate; admissible with governance.",
  };
}

/** Detect internal alias collisions in the canonical library (two caps sharing an alias). */
export function aliasCollisions(): { alias: string; capabilityIds: string[] }[] {
  const byAlias = new Map<string, Set<string>>();
  for (const c of CAPABILITIES) {
    for (const key of [c.id, c.canonicalName, ...c.aliases]) {
      const k = key.toLowerCase();
      const set = byAlias.get(k) ?? new Set<string>();
      set.add(c.id);
      byAlias.set(k, set);
    }
  }
  const out: { alias: string; capabilityIds: string[] }[] = [];
  for (const [alias, ids] of byAlias) {
    if (ids.size > 1) out.push({ alias, capabilityIds: [...ids] });
  }
  return out;
}

// Re-export so consumers can resolve a match id → capability without a second import.
export { capabilityByAlias };

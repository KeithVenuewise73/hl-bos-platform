// Deterministic recommendation-rule engine (Business Transformation Blueprint).
//
// Rules are DATA (rows in discovery.recommendation_rules); this is the pure,
// versioned evaluator. Given the profile's evidence + dimension scores + the
// catalogs, it produces deterministic recommendations, each carrying the
// rule_key + rule_version + evidence references that justify it. There is no
// opaque AI list here — AI narrative is layered on separately and must cite
// these deterministic facts.

export const RULE_ENGINE_VERSION = "rules-0.1.0";

export type Severity = "critical" | "high" | "medium" | "info";
export type PriorityBand = "critical" | "high" | "medium" | "low" | "future";
export type EffortBand = "xs" | "s" | "m" | "l" | "xl";
export type CostBand = "low" | "medium" | "high";

export interface Evidence {
  id: number | string;
  key: string;
  value: Record<string, unknown>;
  confidence: number;
}

export interface DimensionScore {
  framework: "maturity" | "health";
  key: string;
  score: number; // 0–5
}

export interface Rule {
  key: string;
  name: string;
  kind: string; // service | hl_bos_module | quick_win | roadmap_item | risk
  conditions: Record<string, unknown>;
  output: Record<string, unknown>;
  confidence: number;
  ruleVersion?: string;
  isActive?: boolean;
}

export interface CatalogEntry {
  key: string;
  availability: "available" | "coming_soon" | "unavailable" | "deprecated";
}

export interface Recommendation {
  title: string;
  kind: string;
  origin: "deterministic";
  ruleKey: string;
  ruleVersion: string;
  serviceKey?: string;
  moduleKey?: string;
  severity: Severity;
  priorityBand?: PriorityBand;
  effortBand?: EffortBand;
  costBand?: CostBand;
  confidence: number;
  evidenceRefs: Array<number | string>;
  affectedDimensions: string[];
  dedupeGroup?: string;
  excluded?: { reason: string }; // set when the catalog entry is unavailable
}

function evidenceMatches(
  cond: Record<string, unknown>,
  ev: Evidence | undefined,
): boolean {
  if (!ev) return false;
  // Special sentinel: { empty: true } asserts an array-valued field is empty.
  if ((cond as { empty?: boolean }).empty === true) {
    const firstArray = Object.values(ev.value).find((v) => Array.isArray(v)) as
      unknown[] | undefined;
    // also treat the whole value as "tags"/"types" arrays
    const arr =
      firstArray ?? (ev.value.tags as unknown[]) ?? (ev.value.types as unknown[]);
    return Array.isArray(arr) ? arr.length === 0 : Object.keys(ev.value).length === 0;
  }
  return Object.entries(cond).every(([k, want]) => {
    const got = (ev.value as Record<string, unknown>)[k];
    return got === want;
  });
}

/** Evaluate all active rules against the inputs. Deterministic + order-stable. */
export function evaluateRules(
  rules: Rule[],
  evidence: Evidence[],
  dimensions: DimensionScore[],
  catalogs?: { services?: CatalogEntry[]; modules?: CatalogEntry[] },
): Recommendation[] {
  const evByKey = new Map<string, Evidence>();
  for (const e of evidence) if (!evByKey.has(e.key)) evByKey.set(e.key, e);
  const dimBy = new Map<string, DimensionScore>();
  for (const d of dimensions) dimBy.set(`${d.framework}:${d.key}`, d);
  const svc = new Map((catalogs?.services ?? []).map((c) => [c.key, c.availability]));
  const mod = new Map((catalogs?.modules ?? []).map((c) => [c.key, c.availability]));

  const out: Recommendation[] = [];
  for (const rule of rules) {
    if (rule.isActive === false) continue;
    const cond = rule.conditions ?? {};
    const refs: Array<number | string> = [];
    let matched = true;

    const evCond = cond.evidence as Record<string, Record<string, unknown>> | undefined;
    if (evCond) {
      for (const [evKey, expect] of Object.entries(evCond)) {
        const ev = evByKey.get(evKey);
        if (!evidenceMatches(expect, ev)) {
          matched = false;
          break;
        }
        if (ev) refs.push(ev.id);
      }
    }

    const dimCond = cond.dimension as
      { framework: string; key: string; lte?: number; gte?: number } | undefined;
    if (matched && dimCond) {
      const d = dimBy.get(`${dimCond.framework}:${dimCond.key}`);
      if (!d) matched = false;
      else {
        if (dimCond.lte !== undefined && !(d.score <= dimCond.lte)) matched = false;
        if (dimCond.gte !== undefined && !(d.score >= dimCond.gte)) matched = false;
      }
    }

    if (!matched) continue;

    const o = rule.output ?? {};
    const serviceKey = o.service_key as string | undefined;
    const moduleKey = o.module_key as string | undefined;
    let excluded: { reason: string } | undefined;
    if (
      serviceKey &&
      (svc.get(serviceKey) === "unavailable" || svc.get(serviceKey) === "deprecated")
    ) {
      excluded = { reason: `service_unavailable:${serviceKey}` };
    }
    if (
      moduleKey &&
      (mod.get(moduleKey) === "unavailable" || mod.get(moduleKey) === "deprecated")
    ) {
      excluded = { reason: `module_unavailable:${moduleKey}` };
    }

    out.push({
      title: (o.title as string) ?? rule.name,
      kind: rule.kind,
      origin: "deterministic",
      ruleKey: rule.key,
      ruleVersion: rule.ruleVersion ?? RULE_ENGINE_VERSION,
      serviceKey,
      moduleKey,
      severity: (o.severity as Severity) ?? "medium",
      priorityBand: o.priority_band as PriorityBand | undefined,
      effortBand: o.effort_band as EffortBand | undefined,
      costBand: o.cost_band as CostBand | undefined,
      confidence: rule.confidence,
      evidenceRefs: refs,
      affectedDimensions: (o.affected_dimensions as string[]) ?? [],
      dedupeGroup: (o.dedupe_group as string) ?? serviceKey ?? moduleKey ?? rule.key,
      excluded,
    });
  }
  return out;
}

/** Consolidate duplicates by dedupeGroup, keeping the highest-confidence one. */
export function consolidate(recs: Recommendation[]): {
  kept: Recommendation[];
  deferred: Recommendation[];
} {
  const byGroup = new Map<string, Recommendation[]>();
  const kept: Recommendation[] = [];
  const deferred: Recommendation[] = [];
  for (const r of recs) {
    const g = r.dedupeGroup ?? `${r.ruleKey}:${r.title}`;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(r);
  }
  for (const group of byGroup.values()) {
    group.sort((a, b) => b.confidence - a.confidence);
    kept.push(group[0]);
    deferred.push(...group.slice(1));
  }
  return { kept, deferred };
}

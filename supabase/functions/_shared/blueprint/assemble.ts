// Blueprint assembler (Business Transformation Blueprint).
//
// Produces the deterministic Blueprint structure from assessment evidence +
// scores + the data-driven rules and catalogs, then OPTIONALLY layers an AI
// narrative on top. Guarantees:
//   * The deterministic Blueprint is always produced. If AI fails or returns
//     invalid/unsupported output, the result is marked `partial` and the
//     deterministic findings, recommendations, roadmap, and impact all stand.
//   * AI content is fenced as UNTRUSTED (reusing the discovery injection guard)
//     and structurally validated. Every AI finding must cite evidence that
//     actually exists; unsupported AI findings are dropped.
//   * No guaranteed-outcome language survives.

import {
  consolidate,
  evaluateRules,
  RULE_ENGINE_VERSION,
  type CatalogEntry,
  type DimensionScore,
  type Evidence,
  type Recommendation,
  type Rule,
} from "./rules.ts";
import { prioritize, PRIORITY_MODEL_VERSION, type Urgency } from "./priority.ts";
import { buildRoadmap, type Phase, type RoadmapItem } from "./roadmap.ts";
import {
  claimsGuarantee,
  estimateImpact,
  IMPACT_MODEL_VERSION,
  type ImpactEstimate,
  type ImpactInput,
} from "./impact.ts";
import { buildAnalysisRequest } from "../discovery/injection.ts";
import { validateStructuredOutput } from "../ai/structured.ts";
import { redact } from "../ai/redact.ts";

export interface Finding {
  category: string;
  title: string;
  severity: Recommendation["severity"];
  urgency: Urgency;
  origin: "deterministic" | "ai_assisted";
  confidence: number;
  evidenceRefs: Array<number | string>;
  affectedDimensions: string[];
}

export interface BlueprintDraft {
  partial: boolean;
  ruleVersion: string;
  priorityModelVersion: string;
  impactModelVersion: string;
  currentState: { dimension: string; framework: string; score: number }[];
  findings: Finding[];
  recommendations: Array<Recommendation & { priorityBandResolved: string }>;
  deferred: Recommendation[];
  roadmap: RoadmapItem[];
  impacts: ImpactEstimate[];
  narrative: { executiveSummary: string | null; aiFindings: unknown[] } | null;
  aiError?: string;
}

export interface AssembleParams {
  profile: { businessName: string; industry?: string };
  assessment: { maturityScore?: number | null; healthScore?: number | null };
  scores: DimensionScore[];
  evidence: Evidence[];
  rules: Rule[];
  phases: Phase[];
  catalogs?: { services?: CatalogEntry[]; modules?: CatalogEntry[] };
  impactInputs?: ImpactInput[];
  analyze?: (req: ReturnType<typeof buildAnalysisRequest>) => Promise<unknown>;
}

const urgencyFor = (sev: Recommendation["severity"]): Urgency =>
  sev === "critical" ? "immediate" : sev === "high" ? "near_term" : "planned";

export async function assembleBlueprint(
  params: AssembleParams,
): Promise<BlueprintDraft> {
  // 1. deterministic evaluation
  const rawRecs = evaluateRules(
    params.rules,
    params.evidence,
    params.scores,
    params.catalogs,
  );
  const applicable = rawRecs.filter((r) => !r.excluded); // inactive service/module excluded
  const { kept, deferred } = consolidate(applicable);

  const recommendations = kept.map((r) => ({
    ...r,
    priorityBandResolved: prioritize({
      severity: r.severity,
      urgency: urgencyFor(r.severity),
      confidence: r.confidence,
      effort: r.effortBand,
    }).band,
  }));

  // 2. deterministic findings (each backed by the evidence its rule matched)
  const findings: Finding[] = kept.map((r) => ({
    category: r.affectedDimensions[0] ?? r.kind,
    title: r.title,
    severity: r.severity,
    urgency: urgencyFor(r.severity),
    origin: "deterministic",
    confidence: r.confidence,
    evidenceRefs: r.evidenceRefs,
    affectedDimensions: r.affectedDimensions,
  }));

  // 3. current-state snapshot straight from the scored dimensions
  const currentState = params.scores.map((s) => ({
    dimension: s.key,
    framework: s.framework,
    score: s.score,
  }));

  // 4. roadmap + impact (deterministic)
  const roadmap = buildRoadmap(kept, params.phases);
  const impacts = (params.impactInputs ?? []).map(estimateImpact);

  // 5. OPTIONAL AI narrative — fenced, validated, non-blocking
  let narrative: BlueprintDraft["narrative"] = null;
  let partial = false;
  let aiError: string | undefined;
  const evidenceIds = new Set(params.evidence.map((e) => String(e.id)));

  if (params.analyze) {
    try {
      const evidenceText = params.evidence
        .map((e) => `${e.key}: ${JSON.stringify(e.value)}`)
        .join("\n");
      const req = buildAnalysisRequest({
        systemInstructions:
          "You draft a business transformation narrative. Output JSON only. " +
          "Every finding MUST include an evidenceRef drawn from the provided evidence.",
        rubric:
          "Return { executive_summary: string, findings: [{ label, evidenceRef, confidence }] }.",
        untrustedContent: evidenceText,
        requiredKeys: ["executive_summary", "findings"],
      });
      const raw = await params.analyze(req);
      const parsed = validateStructuredOutput(
        typeof raw === "string" ? raw : JSON.stringify(raw),
        { requiredKeys: req.requiredKeys },
      ) as { executive_summary?: unknown; findings?: unknown };

      const summary =
        typeof parsed.executive_summary === "string" ? parsed.executive_summary : "";
      if (claimsGuarantee(summary)) {
        throw new Error("ai_output_rejected:guaranteed_outcome_language");
      }
      const aiFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
      // unsupported AI findings (no valid evidenceRef) are dropped, not trusted
      const supported = aiFindings.filter((f) => {
        const ref = (f as { evidenceRef?: unknown }).evidenceRef;
        return ref != null && evidenceIds.has(String(ref));
      });
      narrative = { executiveSummary: summary || null, aiFindings: supported };
    } catch (e) {
      partial = true;
      aiError = redact(String(e));
      narrative = null;
    }
  }

  return {
    partial,
    ruleVersion: RULE_ENGINE_VERSION,
    priorityModelVersion: PRIORITY_MODEL_VERSION,
    impactModelVersion: IMPACT_MODEL_VERSION,
    currentState,
    findings,
    recommendations,
    deferred,
    roadmap,
    impacts,
    narrative,
    aiError,
  };
}

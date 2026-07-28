// HL-BTI Consulting Intelligence Framework — shared types.
//
// The framework turns a scored assessment into structured consulting output.
// Every claim is classified FACT / INFERENCE / OPINION and carries the evidence
// that supports it. Nothing here fabricates a number.

import type { DomainKey } from "../types.ts";

export type ClaimType = "fact" | "inference" | "opinion";

export interface Claim {
  type: ClaimType;
  text: string;
  evidence: string[]; // human-readable evidence references (ratings, notes, attachments)
}

export type Priority = "critical" | "high" | "medium" | "low";
export type Difficulty = "low" | "medium" | "high";
export type TimelineBucket = "immediate" | "short_term" | "medium_term" | "long_term";
export type Confidence = "high" | "moderate" | "low";

// The 12-part consulting workflow the PCO mandates for every finding.
export interface Finding {
  domain: DomainKey;
  dimension: string;
  label: string;
  rating: number; // 0-5, the verified input
  severity: number; // 5 - rating
  finding: string; // 1. Finding
  supportingEvidence: string[]; // 2. Supporting Evidence
  businessImpact: string; // 3. Business Impact
  rootCause: string; // 4. Root Cause (an INFERENCE)
  businessRisk: string; // 5. Business Risk
  opportunity: string; // 6. Opportunity
  priority: Priority; // 7. Priority
  recommendedAction: string; // 8. Recommended Action (an OPINION)
  difficulty: Difficulty; // 9. Implementation Difficulty
  timeline: TimelineBucket; // 10. Expected Timeline
  successMetrics: string[]; // 11. Success Metrics
  services: string[]; // 12. Recommended Herman Legacy Services
  claims: Claim[]; // FACT / INFERENCE / OPINION breakdown
}

export interface RoadmapItem {
  dimension: string;
  label: string;
  priority: Priority;
  difficulty: Difficulty;
  action: string;
  justification: string;
}

export interface Roadmap {
  immediate: RoadmapItem[]; // 0-30 days
  shortTerm: RoadmapItem[]; // 30-90 days
  mediumTerm: RoadmapItem[]; // 3-6 months
  longTerm: RoadmapItem[]; // 6-12 months
}

export interface SolutionRecommendation {
  service: string;
  supportedBy: string[]; // dimension labels that justify it
  rationale: string;
}

export interface FinancialLine {
  label: string;
  value: number | null; // null => insufficient evidence
  unit: string;
  note: string; // when value is null: "Additional financial information required."
}

export interface NarrativeSection {
  key: string;
  title: string;
  body: string;
  hasData: boolean;
  note?: string;
}

export interface ReviewItem {
  subject: string;
  confidence: Confidence;
  evidenceUsed: string[];
  missingInformation: string[];
  nextQuestions: string[];
}

export interface ConsultingReport {
  generatedFor: string;
  mode: "full_transformation" | "analysis_only";
  transformationScore: number | null;
  findings: Finding[];
  roadmap: Roadmap;
  solutions: SolutionRecommendation[];
  financial: FinancialLine[];
  narrative: NarrativeSection[];
  review: ReviewItem[];
  meta: {
    engineVersion: string;
    domainsAssessed: number;
    dimensionsRated: number;
    findingsGenerated: number;
    factCount: number;
    inferenceCount: number;
    opinionCount: number;
  };
}

// Input to the framework: a scored assessment.
export interface DimensionInput {
  domain: DomainKey;
  dimension: string;
  rating: number; // 0-5
}
export interface EvidenceInput {
  domain: DomainKey;
  dimension?: string;
  label: string;
}
export interface FinancialInput {
  // Only provided values are used. Absent values → "additional information required".
  monthlyRevenue?: number;
  monthlyOperatingCost?: number;
  laborHoursPerMonth?: number;
  laborCostPerHour?: number;
}
export interface AssessmentInput {
  businessName: string;
  industryPack: string;
  mode: "full_transformation" | "analysis_only";
  ratings: DimensionInput[];
  evidence?: EvidenceInput[];
  notes?: Partial<Record<DomainKey, string>>;
  financial?: FinancialInput;
  sample?: boolean; // true when the input is illustrative, not a live client
}

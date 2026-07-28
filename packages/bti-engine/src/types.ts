// Canonical HL-BTI domain types, shared by the engine, the store, and the UI.

export type DomainKey =
  "business" | "operations" | "growth" | "technology" | "ai_readiness" | "financial";

export type Stage =
  | "prospect"
  | "lead_qualification"
  | "business_discovery"
  | "assessment"
  | "executive_analysis"
  | "blueprint"
  | "proposal"
  | "customer_approval"
  | "implementation"
  | "project_management"
  | "roi_tracking"
  | "monthly_partnership"
  | "declined"
  | "on_hold";

export type EngagementMode = "full_transformation" | "analysis_only";

export type Priority = "critical" | "high" | "medium" | "low";
export type RoiBand = "high" | "medium" | "low";

export interface Dimension {
  key: string;
  name: string;
  weight: number;
}

export interface IntelligenceDomain {
  key: DomainKey;
  name: string;
  description: string;
  transformationWeight: number;
  dimensions: Dimension[];
}

export interface IndustryPack {
  key: string;
  name: string;
  description: string;
  applicableDomains: DomainKey[];
}

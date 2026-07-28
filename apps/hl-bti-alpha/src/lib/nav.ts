export type View = "command" | "ceo" | "clients" | "engagement";

export type EngagementTab =
  | "overview"
  | "assessment"
  | "scorecard"
  | "blueprint"
  | "proposal"
  | "implementation"
  | "roi";

export interface Nav {
  view: View;
  engagementId?: string;
  tab: EngagementTab;
}

export type Go = (next: Partial<Nav>) => void;

export const ENGAGEMENT_TABS: { key: EngagementTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "assessment", label: "Assessment" },
  { key: "scorecard", label: "Executive Scorecard" },
  { key: "blueprint", label: "Blueprint" },
  { key: "proposal", label: "Proposal" },
  { key: "implementation", label: "Implementation" },
  { key: "roi", label: "ROI" },
];

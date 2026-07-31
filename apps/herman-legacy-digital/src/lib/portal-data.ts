import { publicSolutions, type PublicSolution } from "./public-data";

/**
 * Client portal data (Release 1). Every section returns EITHER real data OR an
 * honest no-data state. There is no live per-account customer data wired in this
 * release, so most sections are honest `no_data` — we never fabricate progress,
 * metrics, recommendations or ROI (Principle 10).
 *
 * The marketplace enforces the recommendation boundary: additional solutions can
 * only create a DISCUSSION REQUEST — never silently alter the client's advised
 * transformation plan. That boundary is expressed in the data (no plan-altering
 * action exists) and is unit-tested.
 */

export type SectionStatus = "data" | "no_data";

export interface PortalSection {
  key: string;
  title: string;
  status: SectionStatus;
  message: string;
  items?: string[];
}

/** Marketplace item actions. Note: there is deliberately NO "add_to_plan". */
export type MarketplaceAction =
  "recommended_by_advisor" | "in_use" | "request_discussion";

export interface MarketplaceItem {
  key: string;
  name: string;
  description: string;
  category: string;
  tier: "recommended" | "in_use" | "explore";
  action: MarketplaceAction;
}

export interface ClientPortal {
  email: string | null;
  sections: PortalSection[];
  marketplace: {
    recommended: MarketplaceItem[];
    inUse: MarketplaceItem[];
    explore: MarketplaceItem[];
  };
}

// The general first steps most transformations begin with — an advisor tailors
// them per client. NOT a fabricated per-account plan.
const RECOMMENDED_KEYS = ["visibility_ai", "hl_bti"];

function toItem(
  s: PublicSolution,
  tier: MarketplaceItem["tier"],
  action: MarketplaceAction,
): MarketplaceItem {
  return {
    key: s.key,
    name: s.name,
    description: s.description,
    category: s.category,
    tier,
    action,
  };
}

/** Build the client portal for the given viewer (honest no-data by default). */
export function clientPortal(email: string | null): ClientPortal {
  const solutions = publicSolutions();
  const recommended = solutions
    .filter((s) => RECOMMENDED_KEYS.includes(s.key))
    .map((s) => toItem(s, "recommended", "recommended_by_advisor"));
  // No solutions are recorded as adopted for this account in Release 1.
  const inUse: MarketplaceItem[] = [];
  const inUseKeys = new Set(inUse.map((i) => i.key));
  const recKeys = new Set(recommended.map((i) => i.key));
  const explore = solutions
    .filter((s) => !inUseKeys.has(s.key) && !recKeys.has(s.key))
    .map((s) => toItem(s, "explore", "request_discussion"));

  const sections: PortalSection[] = [
    {
      key: "overview",
      title: "Overview",
      status: "no_data",
      message:
        "No active engagement yet. Your engagement status and next step appear here once your assessment begins.",
    },
    {
      key: "engagement_stage",
      title: "Current engagement stage",
      status: "no_data",
      message:
        "Not started. The lifecycle stage shows here once your engagement opens.",
    },
    {
      key: "roadmap",
      title: "Transformation roadmap",
      status: "no_data",
      message:
        "Your transformation blueprint appears here after your HL-BTI assessment. Nothing is shown until it is real.",
    },
    {
      key: "assessments",
      title: "Assessments",
      status: "no_data",
      message: "No assessment has been completed yet. Request one to get started.",
    },
    {
      key: "recommendations",
      title: "Recommendations",
      status: "data",
      message:
        "Where most transformations begin (your advisor tailors these to your business):",
      items: recommended.map((r) => r.name),
    },
    {
      key: "documents",
      title: "Documents & deliverables",
      status: "no_data",
      message:
        "No documents yet. Proposals and reports appear here as they are produced.",
    },
    {
      key: "projects",
      title: "Active projects",
      status: "no_data",
      message: "No active projects yet.",
    },
    {
      key: "next_actions",
      title: "Next actions",
      status: "data",
      message: "To get started:",
      items: ["Request a visibility assessment", "Book a consultation with an advisor"],
    },
    {
      key: "solutions_in_use",
      title: "Solutions currently adopted",
      status: "no_data",
      message: "None adopted yet.",
    },
    {
      key: "support",
      title: "Support",
      status: "data",
      message:
        "Need help? Reach your Herman Legacy advisor via Contact, or request a discussion from the marketplace.",
    },
  ];

  return { email, sections, marketplace: { recommended, inUse, explore } };
}

/**
 * The boundary guard (unit-tested): no marketplace item, in any tier, may carry a
 * plan-altering action. Additional solutions can only request a discussion.
 */
export function marketplaceBoundaryHolds(portal: ClientPortal): boolean {
  const all = [
    ...portal.marketplace.recommended,
    ...portal.marketplace.inUse,
    ...portal.marketplace.explore,
  ];
  const allowed: MarketplaceAction[] = [
    "recommended_by_advisor",
    "in_use",
    "request_discussion",
  ];
  // Explore items (client-initiated) must ONLY be able to request a discussion.
  const exploreOk = portal.marketplace.explore.every(
    (i) => i.action === "request_discussion",
  );
  const actionsOk = all.every((i) => allowed.includes(i.action));
  return exploreOk && actionsOk;
}

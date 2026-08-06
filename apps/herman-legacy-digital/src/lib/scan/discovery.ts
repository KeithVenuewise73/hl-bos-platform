// Executive Discovery — the first consulting question, in the customer's own
// language. Per BTI's Prime Directive we ask ONE thing that materially changes
// the transformation: what does success look like for you? The answer becomes the
// Desired State that the whole report is organized around.
//
// Each goal is mapped to the website dimensions it most depends on (`dims`) and
// the engagement it usually points to (`trackId`), so the Desired State can drive
// the gap analysis and the recommended starting point. `observable` is honest:
// some goals live in operations or finance a website scan cannot see — we say so
// rather than pretend the scan assessed them.

export interface DiscoveryGoal {
  id: string;
  label: string; // the customer's language, shown as a choice
  desiredState: string; // "what success looks like", used as the Desired State
  dims: string[]; // website dimensions this goal most depends on
  trackId: string; // the engagement track this goal usually points to
  observable: boolean; // can a website scan substantially assess this goal?
}

export const DISCOVERY_GOALS: DiscoveryGoal[] = [
  {
    id: "more_customers",
    label: "I want more customers",
    desiredState: "a steady, predictable flow of new customers",
    dims: [
      "lead_generation",
      "conversion",
      "ai_search_optimization",
      "seo",
      "google_business_profile",
    ],
    trackId: "lead_generation",
    observable: true,
  },
  {
    id: "missed_calls",
    label: "We miss too many calls & inquiries",
    desiredState: "every call and inquiry captured and followed up",
    dims: ["lead_generation", "conversion", "google_business_profile"],
    trackId: "crm_automation",
    observable: true,
  },
  {
    id: "online_visibility",
    label: "We need better visibility online",
    desiredState: "strong visibility everywhere buyers look",
    dims: ["ai_search_optimization", "seo", "google_business_profile", "social_media"],
    trackId: "visibility_seo",
    observable: true,
  },
  {
    id: "website_producing",
    label: "Our website isn't generating business",
    desiredState: "a website that turns visitors into real inquiries",
    dims: ["website", "conversion", "lead_generation"],
    trackId: "website",
    observable: true,
  },
  {
    id: "automate",
    label: "We want to automate manual work",
    desiredState: "manual work replaced by dependable automation",
    dims: ["technology_stack"],
    trackId: "crm_automation",
    observable: false,
  },
  {
    id: "organization",
    label: "We need better organization",
    desiredState: "an organized operation that runs smoothly",
    dims: [],
    trackId: "complete",
    observable: false,
  },
  {
    id: "growing_fast",
    label: "We're growing faster than our systems",
    desiredState: "systems that scale with your growth",
    dims: [],
    trackId: "complete",
    observable: false,
  },
  {
    id: "reduce_labor",
    label: "We want to reduce labor cost",
    desiredState: "lower labor cost through smart automation",
    dims: ["technology_stack"],
    trackId: "crm_automation",
    observable: false,
  },
  {
    id: "profitability",
    label: "We want to improve profitability",
    desiredState: "healthier margins and profitability",
    dims: [],
    trackId: "complete",
    observable: false,
  },
  {
    id: "recurring_revenue",
    label: "We need more recurring revenue",
    desiredState: "predictable, recurring revenue",
    dims: [],
    trackId: "complete",
    observable: false,
  },
];

export function goalById(id: string | undefined): DiscoveryGoal | undefined {
  if (!id) return undefined;
  return DISCOVERY_GOALS.find((g) => g.id === id);
}

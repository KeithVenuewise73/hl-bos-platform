// Industry options for the scan form. A small, client-safe mirror of the engine's
// industry-pack keys (@hl-bos/bti-engine consulting/industry.ts). Kept as plain
// data so the client bundle never pulls in the analysis engine. The server is the
// source of truth: /api/scan resolves any key via `templateFor`, which falls back
// to "general", so an unknown or stale key degrades safely rather than failing.
export interface IndustryOption {
  key: string;
  name: string;
}

export const INDUSTRY_OPTIONS: IndustryOption[] = [
  { key: "transportation", name: "Transportation & Logistics" },
  { key: "sports", name: "Sports Organizations" },
  { key: "salon", name: "Salons" },
  { key: "barbershop", name: "Barbershops" },
  { key: "landscaping", name: "Landscaping" },
  { key: "mechanics", name: "Mechanics / Auto Repair" },
  { key: "collision_repair", name: "Collision Repair" },
  { key: "restaurant", name: "Restaurants" },
  { key: "professional_services", name: "Professional Services" },
  { key: "manufacturing", name: "Manufacturing" },
  { key: "healthcare", name: "Healthcare" },
  { key: "general", name: "General Business" },
];

// Display mapping from the engine's internal service names to the Herman Legacy
// product/service catalog the CEO named. This is a presentation alias — it does
// not alter the 43 knowledge rows or the consulting tests. (Minor Modification.)

const MAP: Record<string, string> = {
  "Website Development": "Herman Legacy Digital",
  Hosting: "Herman Legacy Digital",
  "Custom Software": "Herman Legacy Digital",
  "Digital Marketing": "Marketing Services",
  "Business Transformation": "Business Transformation Services",
  "Operational Consulting": "Business Transformation Services",
  Training: "Business Transformation Services",
  "Operating Systems": "Future Vertical Operating Systems",
  "Managed Services": "Reputation Management",
  SEO: "SEO",
  VisibilityAI: "VisibilityAI",
  "AI Automation": "AI Automation",
};

export const HL_PRODUCTS = [
  "Herman Legacy Digital",
  "VisibilityAI",
  "HL-BOS CRM",
  "HomeHuddle",
  "Business Transformation Services",
  "Marketing Services",
  "AI Automation",
  "Reputation Management",
  "Future Vertical Operating Systems",
  "SEO",
] as const;

export function hlServiceLabel(internal: string): string {
  return MAP[internal] ?? internal;
}

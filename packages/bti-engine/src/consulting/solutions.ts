// Herman Legacy solution mapping. A service is recommended ONLY when a finding
// supports it — never speculatively. Services are ranked by how many findings
// (weighted by priority) call for them, so the strongest-supported services
// surface first.

import type { Finding, SolutionRecommendation } from "./types.ts";

const PRIORITY_WEIGHT = { critical: 3, high: 2, medium: 1, low: 1 } as const;

export function mapSolutions(findings: Finding[]): SolutionRecommendation[] {
  const support = new Map<string, { labels: Set<string>; weight: number }>();
  for (const f of findings) {
    for (const svc of f.services) {
      const entry = support.get(svc) ?? { labels: new Set<string>(), weight: 0 };
      entry.labels.add(f.label);
      entry.weight += PRIORITY_WEIGHT[f.priority];
      support.set(svc, entry);
    }
  }
  const out: SolutionRecommendation[] = [];
  for (const [service, entry] of support) {
    const labels = [...entry.labels].sort();
    out.push({
      service,
      supportedBy: labels,
      rationale: `Supported by ${labels.length} finding(s): ${labels.join(", ")}.`,
    });
  }
  // Rank by support weight, then by count, then name — deterministic.
  out.sort((a, b) => {
    const wa = support.get(a.service)!.weight;
    const wb = support.get(b.service)!.weight;
    if (wb !== wa) return wb - wa;
    if (b.supportedBy.length !== a.supportedBy.length)
      return b.supportedBy.length - a.supportedBy.length;
    return a.service.localeCompare(b.service);
  });
  return out;
}

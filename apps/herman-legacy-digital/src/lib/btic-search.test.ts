import { describe, it, expect } from "vitest";
import { dossier, type Dossier } from "./btic-data";
import { searchDossier } from "./btic-search";

const d = dossier("venuewise") as Dossier;

describe("BTIC search — bounded keyword search over one dossier", () => {
  it("empty query returns every entity (nothing filtered out)", () => {
    const hits = searchDossier(d, "");
    const total =
      d.phases.length +
      d.reports.length +
      d.decisions.length +
      d.artifacts.length +
      d.intelligence.length;
    expect(hits.length).toBe(total);
  });

  it("matches a keyword across entities case-insensitively", () => {
    const hits = searchDossier(d, "PRICING");
    expect(hits.length).toBeGreaterThan(0);
    // The post-founding pricing decision must surface.
    expect(
      hits.some((h) => h.entity === "decision" && h.id === "post_founding_pricing"),
    ).toBe(true);
  });

  it("restricts to a single entity type when asked", () => {
    const hits = searchDossier(d, "", "report");
    expect(hits.length).toBe(d.reports.length);
    expect(hits.every((h) => h.entity === "report")).toBe(true);
  });

  it("returns no hits for a term absent from the dossier (no invented matches)", () => {
    const hits = searchDossier(d, "cryptocurrency-airdrop-xyz");
    expect(hits).toHaveLength(0);
  });

  it("bounds the query length (does not choke on oversized input)", () => {
    const huge = "a".repeat(5000);
    const hits = searchDossier(d, huge);
    expect(Array.isArray(hits)).toBe(true);
    expect(hits).toHaveLength(0);
  });

  it("finds the AI readiness gap by the word 'AI'", () => {
    const hits = searchDossier(d, "AI", "intelligence");
    expect(hits.some((h) => h.id === "ai_gap")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { runCycle } from "./reasoning.ts";
import { renderLedger } from "./render.ts";
import { SAFFER_ENGAGEMENT } from "./saffer.ts";

/**
 * The proof. Run against the REAL Saffer public evidence, BTI must reach the
 * same honest conclusion a human consultant did in the manual test:
 *   - it must NOT recommend visibility/SEO to a reputation leader,
 *   - it must refuse to issue a firm recommendation on unknown internal data,
 *   - it must offer recurring revenue as the provisional lead (verified base),
 *   - it must reject missed-opportunity recovery for lack of a capture leak,
 *   - it must name the internal facts needed to go further,
 *   - it must cap its own confidence to LOW and never invent a number.
 */
describe("Saffer end-to-end — the honest wall", () => {
  const l = runCycle(SAFFER_ENGAGEMENT);

  it("does not confirm a binding constraint, but rules demand OUT", () => {
    expect(l.rootCause.bindingLink).toBeNull();
    // Demand is a strength, so it is not among the hypotheses.
    expect(l.rootCause.hypotheses).not.toContain("demand");
    // The internal links are where it looks.
    expect(l.rootCause.hypotheses).toContain("fulfillment");
    expect(l.rootCause.hypotheses).toContain("margin");
  });

  it("emits collect_more_evidence, not a manufactured recommendation", () => {
    expect(l.output).toBe("collect_more_evidence");
    expect(l.recommendation).toBeNull();
  });

  it("offers recurring revenue as the provisional lead (its precondition is verified)", () => {
    const lead = l.options.find((o) => o.id === l.provisionalLeadId);
    expect(lead?.name).toBe("Increase Recurring Revenue");
    expect(lead?.preconditionVerified).toBe(true);
  });

  it("rejects missed-opportunity recovery for lack of a capture leak (no product bias)", () => {
    const rejected = l.rejected.map((r) => r.optionId);
    expect(rejected).toContain("recover-missed-opportunities");
  });

  it("scores nothing — internal data is unknown, so no honest number exists", () => {
    for (const o of l.options) {
      expect(o.score).toBeNull();
    }
  });

  it("caps its own confidence to LOW and is fragile", () => {
    expect(l.confidence).toBe("unknown");
    expect(l.stability.score).toBeLessThan(50);
  });

  it("names the highest-value missing facts, prioritising what could prove it wrong", () => {
    // The very first appetite item must be a transforming/invalidating fact,
    // never a mere confirmation.
    expect(l.appetite.length).toBeGreaterThan(0);
    expect(["transform", "invalidate"]).toContain(l.appetite[0]!.effect);
    // The membership invalidator must be present.
    const facts = l.appetite.map((a) => a.fact.toLowerCase());
    expect(
      facts.some((f) => f.includes("membership") || f.includes("service-plan")),
    ).toBe(true);
  });

  it("authors a measurement contract with an explicitly uncaptured baseline", () => {
    expect(l.measurementContract).not.toBeNull();
    expect(l.measurementContract?.baseline.value).toBeNull();
  });

  it("renders a complete, human-readable ledger", () => {
    const text = renderLedger(l);
    expect(text).toContain("COLLECT MORE EVIDENCE");
    expect(text).toContain("PROVISIONAL LEAD");
    expect(text).toContain("MEASUREMENT CONTRACT");
    expect(text).toContain("EVIDENCE APPETITE");
  });
});

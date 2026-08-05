import { describe, it, expect } from "vitest";
import {
  PROCESSING_STATES,
  HAPPY_PATH,
  canTransition,
  isFailure,
  isTerminalForPipeline,
  nextActionFor,
} from "./states.ts";

describe("processing state machine", () => {
  it("defines all twelve truthful states", () => {
    expect(PROCESSING_STATES).toHaveLength(12);
    expect(PROCESSING_STATES).toContain("hld_review_required");
    expect(PROCESSING_STATES).toContain("clarification_required");
    expect(PROCESSING_STATES).toContain("failed");
  });

  it("allows every step of the happy path in order", () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i++) {
      expect(canTransition(HAPPY_PATH[i]!, HAPPY_PATH[i + 1]!)).toBe(true);
    }
  });

  it("stops the automated pipeline at hld_review_required", () => {
    expect(isTerminalForPipeline("hld_review_required")).toBe(true);
    // The pipeline never auto-advances into approved/client_ready.
    expect(canTransition("report_generation_running", "approved")).toBe(false);
    expect(canTransition("report_generation_running", "client_ready")).toBe(false);
  });

  it("keeps a failed job recoverable, never a silent dead end", () => {
    expect(isFailure("failed")).toBe(true);
    expect(canTransition("failed", "analysis_pending")).toBe(true);
    expect(canTransition("failed", "archived")).toBe(true);
  });

  it("gives a plain-language next action for every state", () => {
    for (const s of PROCESSING_STATES) {
      expect(nextActionFor(s).length).toBeGreaterThan(0);
    }
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("received", "report_generation_running")).toBe(false);
    expect(canTransition("archived", "received")).toBe(false);
  });
});

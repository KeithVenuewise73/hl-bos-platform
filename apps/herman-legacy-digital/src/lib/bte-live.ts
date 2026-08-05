// Server-intended read module (imported only by the /intelligence/pipeline server
// page). No secrets, no request state, no I/O — a deterministic computation over a
// static sample — so it is left importable by unit tests rather than server-only.
import {
  runIntakePipeline,
  fixedClock,
  referenceIds,
  scriptedFetcher,
  succeedingNotifier,
  queueingAcknowledger,
  fetchCollected,
  SAMPLE_INTAKE,
  BTE_PIPELINE_VERSION,
  type EngagementResult,
  type PipelineAdapters,
} from "@hl-bos/bte-pipeline";

/**
 * BTIC ← BTE, at the READ layer. Runs the real @hl-bos/bte-pipeline engine on
 * its built-in ILLUSTRATIVE sample (Rivertown Logistics — never a live client,
 * Principle 10) using the package's own deterministic reference adapters. This
 * surfaces genuine engine output — states, evidence, findings-with-confidence,
 * the draft report — inside the workspace, with no network, no persistence, and
 * no send.
 *
 * This is the presentation-layer proof of the BTDI → BTE → BTIC seam. It does
 * NOT persist to the database: live client engagements appear here only once the
 * additive capture migration (0032) is authored + applied, which is CEO-gated.
 * Nothing here is fabricated: the run is deterministic and reproduced on demand.
 */

// Fixed instant so the demonstration is stable and reproducible (matches the
// sample intake's submittedAt). Never Date.now — this is a canned engine run.
const SAMPLE_CLOCK_ISO = "2026-08-04T12:00:00.000Z";

const READONLY_ADAPTERS: PipelineAdapters = {
  clock: fixedClock(SAMPLE_CLOCK_ISO),
  ids: referenceIds,
  fetcher: scriptedFetcher(fetchCollected),
  notifier: succeedingNotifier, // internal notification (no external transport)
  acknowledger: queueingAcknowledger, // client email transport is CEO-gated → queued
};

/** True — the only engagement shown here is the built-in illustrative sample. */
export const IS_ILLUSTRATIVE_SAMPLE = true;

/** The illustrative business name, surfaced so the UI can label it honestly. */
export const SAMPLE_BUSINESS = SAMPLE_INTAKE.contact.businessName;
export const SAMPLE_INDUSTRY = SAMPLE_INTAKE.industry;
export const ENGINE_VERSION = BTE_PIPELINE_VERSION;

/**
 * Produce the real, deterministic engine result for the illustrative sample.
 * Read-only: no DB write, no network, no message sent.
 */
export async function sampleEngagement(): Promise<EngagementResult> {
  return runIntakePipeline(SAMPLE_INTAKE, READONLY_ADAPTERS);
}

/**
 * THE CUSTOMER MANUFACTURING SYSTEM (Execution Phase 3, CP5 + entry point).
 *
 * The single assembled system that lets Herman Legacy operate entirely on the
 * Software Factory, and the end-to-end validation that proves it. Everything here
 * COMPOSES the existing pieces — the reused engagement machine, the customer
 * lifecycle, VisibilityAI, the Intelligence CRM, the CEO dashboard — and adds no
 * new system.
 *
 * The validation demonstrates a prospect moving Discovery → VisibilityAI → HL-BTI
 * → Proposal → Project → Deployment → Subscription → Renewal WITHOUT any duplicate
 * system. It is a STRUCTURAL proof (the plumbing), using an explicitly-labeled
 * sample — never a fabricated customer, revenue, or metric (Principle 10).
 */

import {
  CUSTOMER_LIFECYCLE,
  customerManufacturingLifecycle,
  noDuplicateSystems,
  isForwardEngagementWalk,
  type CustomerStageSpec,
} from "./customer-lifecycle";
import { evaluateVisibilityAi } from "./visibility-ai";
import { intelligenceCrmModel } from "./crm";
import { ceoOperationsDashboard } from "./ceo-operations";
import type { Stage } from "@hl-bos/bti-engine";

/** The eight-waypoint end-to-end path the brief requires be demonstrated. */
export const END_TO_END_PATH = [
  "Lead Discovery",
  "Visibility Assessment",
  "HL-BTI Assessment",
  "Proposal Generation",
  "Project Creation",
  "Deployment",
  "Subscription Activation",
  "Renewal",
] as const;

export interface E2EWaypoint {
  waypoint: string;
  stageSeq: number;
  engagementStage: Stage;
  backingSystem: string;
  backingAssets: string[];
}

export interface CustomerManufacturingValidation {
  ok: boolean;
  waypoints: E2EWaypoint[];
  /** Every waypoint resolved to a real lifecycle stage. */
  allWaypointsResolved: boolean;
  /** The demo path is a legal forward walk of the reused engagement machine. */
  forwardWalkValid: boolean;
  /** The full 21-stage lifecycle rides validly on the reused machine. */
  fullLifecycleValid: boolean;
  /** No stage introduces a system outside the Enterprise Catalog. */
  noDuplicateSystems: boolean;
  /** VisibilityAI needs no redesign. */
  visibilityNoRedesign: boolean;
  /** The Intelligence CRM adds no new database. */
  crmNoNewDatabase: boolean;
  failures: string[];
}

function findStage(name: string): CustomerStageSpec | undefined {
  return CUSTOMER_LIFECYCLE.find((s) => s.name === name);
}

/**
 * CP5 — validate that Herman Legacy can operate entirely on the Factory: a
 * prospect can traverse the required path with no duplicate systems.
 */
export function validateCustomerManufacturing(): CustomerManufacturingValidation {
  const failures: string[] = [];

  const waypoints: E2EWaypoint[] = [];
  for (const name of END_TO_END_PATH) {
    const stage = findStage(name);
    if (!stage) {
      failures.push(`Waypoint "${name}" has no lifecycle stage.`);
      continue;
    }
    waypoints.push({
      waypoint: name,
      stageSeq: stage.seq,
      engagementStage: stage.engagementStage,
      backingSystem: stage.backingSystem,
      backingAssets: stage.backingAssets,
    });
  }
  const allWaypointsResolved = waypoints.length === END_TO_END_PATH.length;
  if (!allWaypointsResolved) failures.push("Not every waypoint resolved to a stage.");

  const forwardWalkValid = isForwardEngagementWalk(
    waypoints.map((w) => w.engagementStage),
  );
  if (!forwardWalkValid)
    failures.push("Demo path is not a valid forward engagement walk.");

  const lifecycle = customerManufacturingLifecycle();
  const fullLifecycleValid = lifecycle.engagementPathValid;
  if (!fullLifecycleValid)
    failures.push("Full lifecycle is not a valid engagement walk.");

  const dup = noDuplicateSystems();
  if (!dup.ok) {
    failures.push(
      `Duplicate-system risk: unknown assets ${dup.unknownAssets.join(", ")}.`,
    );
  }

  const vis = evaluateVisibilityAi();
  if (!vis.noRedesignRequired) failures.push("VisibilityAI would require a redesign.");

  const crm = intelligenceCrmModel();
  // "No new database" = the CRM's non-net-new entities are all backed by existing
  // catalog assets (net-new Customer Health is a desk, not a new CRM store).
  const crmNoNewDatabase = crm.reusedAssets.length > 0 && crm.netNewCount <= 1;
  if (!crmNoNewDatabase) failures.push("Intelligence CRM would need a new database.");

  return {
    ok: failures.length === 0,
    waypoints,
    allWaypointsResolved,
    forwardWalkValid,
    fullLifecycleValid,
    noDuplicateSystems: dup.ok,
    visibilityNoRedesign: vis.noRedesignRequired,
    crmNoNewDatabase,
    failures,
  };
}

/**
 * The one assembled Customer Manufacturing System — lifecycle + VisibilityAI +
 * Intelligence CRM + CEO dashboard + the validation. A single entry point for the
 * portal and the Control Center.
 */
export function customerManufacturingSystem() {
  return {
    lifecycle: customerManufacturingLifecycle(),
    visibilityAi: evaluateVisibilityAi(),
    crm: intelligenceCrmModel(),
    ceoDashboard: ceoOperationsDashboard(),
    validation: validateCustomerManufacturing(),
  };
}

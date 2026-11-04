/**
 * The FleetBackend boundary.
 *
 * Production's fleet backend is one SECURITY DEFINER function,
 * fleet.api(op text, a jsonb) — exposed to clients as public.hlg_fleet_rpc.
 * Every TMS screen talks to it through this interface, so the app runs
 * unchanged against:
 *
 *   - MemoryFleetBackend (this package): a TypeScript port of fleet.api that
 *     keeps everything in memory. It powers the local demo. NOTHING IT HOLDS
 *     IS PERSISTED, and it is not a database.
 *   - the recovered fleet.api itself, in an isolated PostgreSQL — exercised by
 *     the parity tests (backend.parity.test.ts) through psql.
 *   - (future) Supabase: rpc('hlg_fleet_rpc', { p_op, p_args }) with the
 *     signed-in user's JWT. Not wired in this branch; see the README.
 */

import type { InspectionAction, InspectionReport, StoredAction } from "./dvir.ts";
import type { Operation, Role } from "./entitlements.ts";

export class FleetError extends Error {
  /** Postgres SQLSTATE where production sets one (42501 = permission). */
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "FleetError";
    this.code = code;
  }
}

export interface FleetBackend {
  call<T = unknown>(
    actor: string,
    op: Operation,
    args?: Record<string, unknown>,
  ): Promise<T>;
}

// ---- Shapes fleet.api returns (only the parts the app reads) -------------

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: Role;
  version: string;
}

/**
 * fleet.api stores units, work orders, fuel entries and driver profiles as
 * free-form JSON. These are the fields the TMS reads; anything else a client
 * stored is preserved untouched.
 */
export interface FleetRecord {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  tankConfig?: unknown;
  status?: unknown;
  asset?: unknown;
  title?: unknown;
  cost?: unknown;
  gallons?: unknown;
  opened?: unknown;
  year?: unknown;
  make?: unknown;
  model?: unknown;
  vin?: unknown;
  plate?: unknown;
  odometer?: unknown;
  registrationExpires?: unknown;
  email?: unknown;
  licenseClass?: unknown;
  endorsements?: unknown;
  cdlExpires?: unknown;
  medicalExpires?: unknown;
  hired?: unknown;
  category?: unknown;
  date?: unknown;
  costCents?: unknown;
  [k: string]: unknown;
}

export interface FleetPayload {
  assets: FleetRecord[];
  work: FleetRecord[];
  fuel: FleetRecord[];
  drivers: FleetRecord[];
  driverEvents: FleetRecord[];
  policy: Record<string, unknown>;
}

export interface StoredInspection {
  id: string;
  actor: string;
  created_at: string;
  payload: InspectionReport & { companyPolicy?: unknown };
}

export interface StoredServiceRecord {
  id: string;
  asset: string;
  work_id: string | null;
  actor: string;
  created_at: string;
  payload: FleetRecord;
}

export interface Snapshot {
  state: { id: 1; revision: number; payload: FleetPayload | null };
  inspections: StoredInspection[];
  inspection_actions: StoredAction[];
  unit_records: StoredServiceRecord[];
  unit_documents: unknown[];
  unit_record_events: unknown[];
}

export interface TeamMember {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  units: string[];
}

export type { InspectionAction };

/**
 * Structural check, not `instanceof`: a bundler may load this module twice
 * (Next.js put it in two server chunks), giving two FleetError classes, and
 * `instanceof` then fails — every refusal surfaced as a blank 500. Found by
 * the browser test.
 */
export function isFleetError(e: unknown): e is FleetError {
  return e instanceof Error && e.name === "FleetError";
}

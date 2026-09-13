/**
 * BarberOS as a product, read from the catalog rather than described.
 *
 * The capability catalog is not documentation: 0055's honesty trigger refuses
 * any proposal naming a capability it has never heard of, and refuses to call
 * anything deliverable that the catalog does not mark `available`. So this page
 * and the proposal are reading the same table, and the two can never disagree
 * about what BarberOS is.
 *
 * The SQL and the mapping are pure and unit-tested, like the rest of this
 * console's data layer.
 */

import type { SqlRunner } from "./shop-audit-sql";

export type CapabilityStatus = "available" | "planned" | "deferred";
export type BlockerOwner = "ceo" | "engineering";

export interface Capability {
  key: string;
  name: string;
  category: string;
  description: string;
  status: CapabilityStatus;
  /** What it is waiting on. Null for anything shipped. */
  blockedOn: string | null;
  /** Who can clear it. Null exactly when blockedOn is. */
  blockerOwner: BlockerOwner | null;
  /** Keys this module needs before it can be switched on. */
  requires: string[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * An unrecognised status reads as `planned`, never `available`.
 *
 * The same rule the proposal uses, for the same reason: under-promising costs
 * a slower sale and over-promising costs a contract we cannot honour.
 */
export function toStatus(v: unknown): CapabilityStatus {
  const s = str(v);
  return s === "available" || s === "deferred" ? s : "planned";
}

/**
 * The owner as written, or null when nothing was written.
 *
 * Only the exact string `ceo` puts a job on the CEO's list. Any other non-empty
 * value reads as `engineering`: being wrong that way puts a job on my list that
 * turns out to need an account, and I come back and say so. Being wrong the
 * other way puts a job on his list that was never his, and it sits there.
 *
 * Null here means "the row said nothing", NOT "no owner" -- the default for a
 * row that has a blocker is applied in `toCapability`, which is the only place
 * that knows whether there is one.
 */
export function toOwner(v: unknown): BlockerOwner | null {
  const s = str(v);
  if (s === null) return null;
  return s === "ceo" ? "ceo" : "engineering";
}

export function toCapability(r: Record<string, unknown>): Capability | null {
  const key = str(r["key"]);
  if (key === null) return null;
  const blockedOn = str(r["blocked_on"]);
  return {
    key,
    name: str(r["name"]) ?? key,
    category: str(r["category"]) ?? "",
    description: str(r["description"]) ?? "",
    status: toStatus(r["status"]),
    blockedOn,
    // The schema guarantees these agree; this keeps them agreeing even if a row
    // arrives half-formed. A blocker always names somebody -- defaulting to
    // engineering -- and an owner with nothing to clear is dropped. Rendering
    // "blocked by nobody" would be a job nobody ever picks up.
    blockerOwner:
      blockedOn === null ? null : (toOwner(r["blocker_owner"]) ?? "engineering"),
    requires:
      str(r["requires"])
        ?.split(",")
        .filter((x) => x !== "") ?? [],
  };
}

export const PRODUCT_MAP_SQL = () => `
select c.key::text as key, c.name, c.category::text as category, c.description,
       c.status::text as status, c.blocked_on, c.blocker_owner::text as blocker_owner,
       (select string_agg(r.requires_key::text, ',' order by r.requires_key)
          from barberos.capability_requires r
         where r.capability_key = c.key) as requires
  from barberos.capabilities c
 order by c.status, c.category, c.key`;

export async function loadProductMap(run: SqlRunner): Promise<Capability[]> {
  return (await run(PRODUCT_MAP_SQL())).flatMap((r) => {
    const c = toCapability(r);
    return c === null ? [] : [c];
  });
}

/** Shipped. A contract may rest on these. */
export function shipped(all: readonly Capability[]): Capability[] {
  return all.filter((c) => c.status === "available");
}

/** Waiting on an account, a credential, a number — a decision about trust. */
export function waitingOnCeo(all: readonly Capability[]): Capability[] {
  return all.filter((c) => c.status === "planned" && c.blockerOwner === "ceo");
}

/** Waiting on engineering time, and nothing else. */
export function waitingOnEngineering(all: readonly Capability[]): Capability[] {
  return all.filter((c) => c.status === "planned" && c.blockerOwner === "engineering");
}

/** Decided against. Never offered, never shown as coming. */
export function decidedAgainst(all: readonly Capability[]): Capability[] {
  return all.filter((c) => c.status === "deferred");
}

/**
 * The one-line truth about how much of the product exists.
 *
 * Stated as a fraction rather than a percentage because "11% complete" invites
 * a reader to round it up in their head, and because the denominator is the
 * interesting part.
 */
export function completeness(all: readonly Capability[]): {
  shipped: number;
  sellable: number;
  blockedOnAccess: number;
} {
  const sellable = all.filter((c) => c.status !== "deferred").length;
  return {
    shipped: shipped(all).length,
    sellable,
    blockedOnAccess: waitingOnCeo(all).length,
  };
}

// Business-line isolation.
//
// HLD and HSCS keep separate records, campaigns, offers and books. This module
// is the one place that decides who may see or change a business line's
// records. It mirrors the HL-BOS pattern (tenant membership + role permission,
// enforced by row-level security in the database): when these records move
// into Supabase, each line is its own tenant and RLS enforces the same rule.
// Until then, every read and write here goes through `assertAccess`.
//
// Roles:
//   owner     — the CEO. Every line, plus consolidated reporting.
//   line_lead — manages one or more named lines.
//   line_viewer — reads one or more named lines.
// There is no implicit access: an empty `lines` list sees nothing.

import type { BusinessLine } from "./types.ts";

export type GrowthRole = "owner" | "line_lead" | "line_viewer";

export interface Principal {
  id: string;
  role: GrowthRole;
  /** Ignored for `owner`. */
  lines: BusinessLine[];
}

export type Access = "read" | "write";

export class AccessDeniedError extends Error {
  constructor(
    principal: Principal,
    line: BusinessLine | "consolidated",
    access: Access,
  ) {
    super(
      `${principal.id} may not ${access} ${line === "consolidated" ? "consolidated reporting" : line} records.`,
    );
    this.name = "AccessDeniedError";
  }
}

export function canAccess(p: Principal, line: BusinessLine, access: Access): boolean {
  if (p.role === "owner") return true;
  if (!p.lines.includes(line)) return false;
  return access === "read" || p.role === "line_lead";
}

export function assertAccess(p: Principal, line: BusinessLine, access: Access): void {
  if (!canAccess(p, line, access)) throw new AccessDeniedError(p, line, access);
}

/** Consolidated (both-line) reporting and the Growth section are owner-only. */
export function assertOwner(p: Principal): void {
  if (p.role !== "owner") throw new AccessDeniedError(p, "consolidated", "read");
}

export interface LineScoped {
  id: string;
  line: BusinessLine;
}

/**
 * An in-memory, line-isolated store. The shape a database-backed store must
 * keep: no method returns a record of a line the caller cannot read, and a
 * record cannot be moved to another line by overwriting it.
 */
export class LineScopedStore<T extends LineScoped> {
  private readonly rows = new Map<string, T>();

  list(p: Principal, line: BusinessLine): T[] {
    assertAccess(p, line, "read");
    return [...this.rows.values()]
      .filter((r) => r.line === line)
      .map((r) => structuredClone(r));
  }

  /** Owner-only: every line. */
  listAll(p: Principal): T[] {
    assertOwner(p);
    return [...this.rows.values()].map((r) => structuredClone(r));
  }

  get(p: Principal, id: string): T | undefined {
    const r = this.rows.get(id);
    // A record the caller cannot read is reported as absent, not as forbidden,
    // so existence of the other line's records does not leak.
    if (!r || !canAccess(p, r.line, "read")) return undefined;
    return structuredClone(r);
  }

  save(p: Principal, record: T): void {
    assertAccess(p, record.line, "write");
    const existing = this.rows.get(record.id);
    if (existing && existing.line !== record.line) {
      throw new Error(
        `Record ${record.id} belongs to ${existing.line}; it cannot be moved to ${record.line} by saving it.`,
      );
    }
    this.rows.set(record.id, structuredClone(record));
  }
}

import "server-only";

/** One tenant, as the cloud plane shows it. A Herman Legacy company today; an
 * external customer later — the same shape and the same code path. */
export interface TenantSummary {
  readonly id: string;
  readonly name: string;
  readonly tenantClass: "first_party" | "customer";
  readonly status: string;
}

export interface TenantView {
  readonly connected: boolean;
  readonly reason: string;
  readonly tenants: readonly TenantSummary[];
}

/**
 * Read-only tenant listing.
 *
 * The platform tenant tables (HL-BOS `platform` schema) are not applied to
 * HL-BOS Core yet, so there is nothing real to list. This returns an honest
 * empty result with the reason — never an invented tenant (principle 10).
 * Herman Legacy companies will be the first rows here; external customers use
 * the identical shape and the identical path.
 */
export function listTenants(): TenantView {
  return {
    connected: false,
    reason:
      "The platform tenant tables are not applied yet. Herman Legacy companies will be the first tenants; external customers use the same path.",
    tenants: [],
  };
}

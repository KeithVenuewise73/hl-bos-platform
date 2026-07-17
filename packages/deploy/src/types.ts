/**
 * @hl-bos/deploy — the deployment contract.
 *
 * Every hosting provider (a commercial cloud today, Herman-Legacy-managed
 * infrastructure tomorrow) is expressed as one implementation of
 * `DeploymentProvider`. Headquarters and the vertical applications depend only
 * on this file and on `DeploymentService` — never on a provider's SDK — which
 * is what lets the underlying infrastructure change without redesigning them.
 */

/**
 * The key of a registered provider adapter, e.g. `"vercel"`, `"netlify"`,
 * `"cloudflare"`, `"hl-managed"`. It is deliberately an open string, not a
 * union: adding a provider must never change this type or force a change in
 * any caller.
 */
export type ProviderKey = string;

/** A deployment serves either a preview (per branch / PR) or production. */
export type DeployEnvironment = "preview" | "production";

/** Lifecycle of a single deployment, normalized across providers. */
export type DeploymentStatus =
  | "queued"
  | "building"
  | "ready"
  | "error"
  | "canceled"
  | "superseded"
  | "not-configured";

/**
 * What a provider can actually do. The cloud plane reads this to shape its UI
 * and to refuse an operation a provider cannot honor — rather than offering a
 * control that silently does nothing.
 */
export interface ProviderCapabilities {
  /** Per-branch / per-PR preview environments. */
  readonly previewEnvironments: boolean;
  /** Promote an existing build to production without rebuilding. */
  readonly instantPromotion: boolean;
  /** Roll back to a previous deployment without a rebuild. */
  readonly instantRollback: boolean;
  readonly customDomains: boolean;
  /** The provider builds from source; false means we hand it a prebuilt artifact. */
  readonly buildsFromSource: boolean;
  /** True for Herman-Legacy-managed infrastructure. */
  readonly selfHosted: boolean;
  /** Selectable regions, or `"provider-managed"` when the caller cannot choose. */
  readonly regions: readonly string[] | "provider-managed";
}

/**
 * Identifies the thing being deployed. Tenant-scoped, so the same application
 * can be deployed per tenant on the multi-tenant plane.
 */
export interface DeploymentTarget {
  /** e.g. `"control-center"`, `"cloud"`, `"hscs-glp"`, `"salon"`. */
  readonly app: string;
  /** `null` for a platform-level app; a tenant id for a per-tenant deployment. */
  readonly tenantId: string | null;
  readonly environment: DeployEnvironment;
}

/** The source to deploy. The commit is the source of truth; ref is human context. */
export interface DeploymentSource {
  readonly repo: string;
  readonly ref: string;
  readonly commit: string;
}

/**
 * A binding for one environment variable. A secret is referenced by its vault
 * key and resolved by the provider at deploy time — the secret *value* never
 * passes through this package.
 */
export interface EnvVarBinding {
  readonly name: string;
  readonly source:
    | { readonly kind: "vault"; readonly vaultKey: string }
    | { readonly kind: "literal"; readonly value: string };
}

export interface DeploymentRequest {
  readonly target: DeploymentTarget;
  readonly source: DeploymentSource;
  readonly env: readonly EnvVarBinding[];
  /** Provider-neutral build hints. Providers that build from source may ignore it. */
  readonly build?: {
    readonly command?: string;
    readonly outputDir?: string;
  };
}

/** A branded id, so a deployment id cannot be confused with any other string. */
export type DeploymentId = string & { readonly __brand: "DeploymentId" };

/** Wrap a raw string as a `DeploymentId`. */
export function asDeploymentId(value: string): DeploymentId {
  return value as DeploymentId;
}

export interface DeploymentRecord {
  readonly id: DeploymentId;
  readonly provider: ProviderKey;
  readonly target: DeploymentTarget;
  readonly source: DeploymentSource;
  readonly status: DeploymentStatus;
  /** The URL the deployment serves, once known. */
  readonly url: string | null;
  /** ISO 8601. Supplied by the caller or provider; this package never reads a clock. */
  readonly createdAt: string;
  /** Plain-English note — especially for `not-configured` and `error`. */
  readonly detail: string | null;
}

export interface PromoteRequest {
  readonly deploymentId: DeploymentId;
  readonly target: DeploymentTarget;
}

export interface RollbackRequest {
  readonly target: DeploymentTarget;
  /** The previously-good deployment to restore. */
  readonly toDeploymentId: DeploymentId;
}

export interface DeploymentLogLine {
  readonly at: string;
  readonly level: "info" | "warn" | "error";
  readonly message: string;
}

/**
 * The contract every hosting provider implements.
 *
 * Migrating from a commercial host to Herman-Legacy-managed infrastructure
 * means writing one more implementation of this interface and registering it.
 * No caller — not Headquarters, not any application — changes.
 */
export interface DeploymentProvider {
  readonly key: ProviderKey;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  createDeployment(request: DeploymentRequest): Promise<DeploymentRecord>;
  getDeployment(id: DeploymentId): Promise<DeploymentRecord | null>;
  listDeployments(target: DeploymentTarget): Promise<readonly DeploymentRecord[]>;
  promote(request: PromoteRequest): Promise<DeploymentRecord>;
  rollback(request: RollbackRequest): Promise<DeploymentRecord>;
  getLogs(id: DeploymentId): Promise<readonly DeploymentLogLine[]>;
  destroy(id: DeploymentId): Promise<void>;
}

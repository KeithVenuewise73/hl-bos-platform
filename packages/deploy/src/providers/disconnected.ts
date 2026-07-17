import {
  asDeploymentId,
  type DeploymentLogLine,
  type DeploymentProvider,
  type DeploymentRecord,
  type DeploymentRequest,
  type DeploymentTarget,
  type ProviderCapabilities,
  type PromoteRequest,
  type RollbackRequest,
} from "../types.js";

const NOT_CONFIGURED_DETAIL =
  "No hosting provider is connected yet. Connect one in Herman Legacy Cloud. " +
  "Nothing has been deployed.";

const CAPABILITIES: ProviderCapabilities = {
  previewEnvironments: false,
  instantPromotion: false,
  instantRollback: false,
  customDomains: false,
  buildsFromSource: false,
  selfHosted: false,
  regions: "provider-managed",
};

/**
 * The honest default provider.
 *
 * Herman Legacy Cloud can stand up before any real host is connected. Rather
 * than pretend, this adapter implements the full contract and truthfully
 * reports `not-configured` for every operation. It never returns a fake
 * success: a deploy control wired to this provider tells the operator exactly
 * why nothing happened. (HL-BOS principle 10 — never invent a successful run.)
 */
export class DisconnectedProvider implements DeploymentProvider {
  readonly key = "disconnected";
  readonly displayName = "No provider connected";
  readonly capabilities = CAPABILITIES;

  #notConfigured(target: DeploymentTarget): DeploymentRecord {
    return {
      id: asDeploymentId(""),
      provider: this.key,
      target,
      source: { repo: "", ref: "", commit: "" },
      status: "not-configured",
      url: null,
      createdAt: "",
      detail: NOT_CONFIGURED_DETAIL,
    };
  }

  createDeployment(request: DeploymentRequest): Promise<DeploymentRecord> {
    return Promise.resolve(this.#notConfigured(request.target));
  }

  getDeployment(): Promise<DeploymentRecord | null> {
    return Promise.resolve(null);
  }

  listDeployments(): Promise<readonly DeploymentRecord[]> {
    return Promise.resolve([]);
  }

  promote(request: PromoteRequest): Promise<DeploymentRecord> {
    return Promise.resolve(this.#notConfigured(request.target));
  }

  rollback(request: RollbackRequest): Promise<DeploymentRecord> {
    return Promise.resolve(this.#notConfigured(request.target));
  }

  getLogs(): Promise<readonly DeploymentLogLine[]> {
    return Promise.resolve([]);
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}

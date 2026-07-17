import type { ProviderRegistry } from "./registry.js";
import type {
  DeploymentId,
  DeploymentLogLine,
  DeploymentProvider,
  DeploymentRecord,
  DeploymentRequest,
  DeploymentTarget,
  ProviderKey,
  RollbackRequest,
} from "./types.js";

/**
 * Resolves which provider a given target should deploy to. Supplied by the
 * cloud plane — typically a lookup against platform configuration, so the host
 * for an app or a tenant is *data*, not code. This function is where "a
 * commercial provider now, Herman-Legacy-managed infrastructure later" becomes
 * a configuration change rather than a rewrite.
 */
export type ProviderResolver = (target: DeploymentTarget) => ProviderKey;

/**
 * The single seam Headquarters and the vertical applications deploy through.
 *
 * It owns no provider logic. It resolves the configured provider for a target
 * and delegates. Because callers depend on this class and the types — never on
 * a provider SDK — the underlying infrastructure can change without touching
 * Headquarters or any application.
 */
export class DeploymentService {
  readonly #registry: ProviderRegistry;
  readonly #resolveProvider: ProviderResolver;

  constructor(registry: ProviderRegistry, resolveProvider: ProviderResolver) {
    this.#registry = registry;
    this.#resolveProvider = resolveProvider;
  }

  #providerFor(target: DeploymentTarget): DeploymentProvider {
    return this.#registry.get(this.#resolveProvider(target));
  }

  deploy(request: DeploymentRequest): Promise<DeploymentRecord> {
    return this.#providerFor(request.target).createDeployment(request);
  }

  promoteToProduction(
    deploymentId: DeploymentId,
    target: DeploymentTarget,
  ): Promise<DeploymentRecord> {
    return this.#providerFor(target).promote({ deploymentId, target });
  }

  rollback(request: RollbackRequest): Promise<DeploymentRecord> {
    return this.#providerFor(request.target).rollback(request);
  }

  list(target: DeploymentTarget): Promise<readonly DeploymentRecord[]> {
    return this.#providerFor(target).listDeployments(target);
  }

  logs(
    target: DeploymentTarget,
    id: DeploymentId,
  ): Promise<readonly DeploymentLogLine[]> {
    return this.#providerFor(target).getLogs(id);
  }
}

export function createDeploymentService(
  registry: ProviderRegistry,
  resolveProvider: ProviderResolver,
): DeploymentService {
  return new DeploymentService(registry, resolveProvider);
}

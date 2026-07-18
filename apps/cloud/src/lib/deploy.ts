import {
  createDeploymentService,
  DisconnectedProvider,
  ProviderRegistry,
  type DeploymentService,
} from "@hl-bos/deploy";

/**
 * The cloud plane's deployment wiring — provider-agnostic.
 *
 * It builds a registry and resolves a provider per target from configuration.
 * No host is connected yet, so the only registered adapter is the honest
 * DisconnectedProvider and every target resolves to it: deploys report
 * "not configured" rather than pretending. Connecting a real provider —
 * commercial now, Herman-Legacy-managed later — is a change to this registry
 * and resolver, with no change to any caller.
 */
const registry = new ProviderRegistry().register(new DisconnectedProvider());

export function deploymentService(): DeploymentService {
  return createDeploymentService(registry, () => "disconnected");
}

export function registeredProviders(): readonly string[] {
  return registry.list();
}

export function hasRealProvider(): boolean {
  return registry.list().some((key) => key !== "disconnected");
}

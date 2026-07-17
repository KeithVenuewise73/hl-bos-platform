/**
 * @hl-bos/deploy — provider-agnostic deployment abstraction.
 *
 * Herman Legacy Cloud deploys Headquarters and the vertical applications
 * through this package. The hosting provider is a registered adapter behind the
 * `DeploymentProvider` interface, resolved per target by configuration. Swapping
 * the underlying infrastructure — including to Herman-Legacy-managed hosting —
 * is a new adapter plus a config change, with no change to any caller.
 *
 * See README.md for the design and the migration guarantee.
 */

export {
  asDeploymentId,
  type ProviderKey,
  type DeployEnvironment,
  type DeploymentStatus,
  type ProviderCapabilities,
  type DeploymentTarget,
  type DeploymentSource,
  type EnvVarBinding,
  type DeploymentRequest,
  type DeploymentId,
  type DeploymentRecord,
  type PromoteRequest,
  type RollbackRequest,
  type DeploymentLogLine,
  type DeploymentProvider,
} from "./types.js";

export { ProviderRegistry, UnknownProviderError } from "./registry.js";

export {
  DeploymentService,
  createDeploymentService,
  type ProviderResolver,
} from "./service.js";

export { DisconnectedProvider } from "./providers/disconnected.js";

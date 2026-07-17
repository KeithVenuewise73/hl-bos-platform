import type { DeploymentProvider, ProviderKey } from "./types.js";

/** Thrown when a provider key is requested that was never registered. */
export class UnknownProviderError extends Error {
  constructor(
    readonly key: ProviderKey,
    known: readonly ProviderKey[],
  ) {
    super(
      `No deployment provider is registered under "${key}". ` +
        `Registered: ${known.length > 0 ? known.join(", ") : "(none)"}.`,
    );
    this.name = "UnknownProviderError";
  }
}

/**
 * Holds the provider adapters available to this deployment.
 *
 * The cloud plane builds one registry at startup from configuration. Callers
 * never touch it directly — they go through `DeploymentService`, which asks the
 * registry for the provider a given target is configured to use.
 */
export class ProviderRegistry {
  readonly #providers = new Map<ProviderKey, DeploymentProvider>();

  register(provider: DeploymentProvider): this {
    this.#providers.set(provider.key, provider);
    return this;
  }

  has(key: ProviderKey): boolean {
    return this.#providers.has(key);
  }

  get(key: ProviderKey): DeploymentProvider {
    const provider = this.#providers.get(key);
    if (!provider) {
      throw new UnknownProviderError(key, this.list());
    }
    return provider;
  }

  list(): readonly ProviderKey[] {
    return [...this.#providers.keys()];
  }
}

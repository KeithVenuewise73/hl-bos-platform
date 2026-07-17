import { describe, expect, it } from "vitest";
import {
  asDeploymentId,
  createDeploymentService,
  DisconnectedProvider,
  ProviderRegistry,
  UnknownProviderError,
  type DeploymentProvider,
  type DeploymentRecord,
  type DeploymentRequest,
  type DeploymentTarget,
} from "./index.js";

const target: DeploymentTarget = {
  app: "cloud",
  tenantId: null,
  environment: "preview",
};

const request: DeploymentRequest = {
  target,
  source: { repo: "hl-bos-platform", ref: "main", commit: "abc123" },
  env: [{ name: "VITE_SUPABASE_URL", source: { kind: "literal", value: "https://x" } }],
};

/** A stand-in provider that records what it was asked to do. */
class RecordingProvider implements DeploymentProvider {
  readonly key = "recording";
  readonly displayName = "Recording";
  readonly capabilities = {
    previewEnvironments: true,
    instantPromotion: true,
    instantRollback: true,
    customDomains: true,
    buildsFromSource: true,
    selfHosted: false,
    regions: ["iad1"] as const,
  };
  readonly created: DeploymentRequest[] = [];

  createDeployment(r: DeploymentRequest): Promise<DeploymentRecord> {
    this.created.push(r);
    return Promise.resolve({
      id: asDeploymentId("d1"),
      provider: this.key,
      target: r.target,
      source: r.source,
      status: "ready",
      url: "https://preview.example",
      createdAt: "2026-01-01T00:00:00Z",
      detail: null,
    });
  }
  getDeployment(): Promise<DeploymentRecord | null> {
    return Promise.resolve(null);
  }
  listDeployments(): Promise<readonly DeploymentRecord[]> {
    return Promise.resolve([]);
  }
  promote(): Promise<DeploymentRecord> {
    return this.createDeployment(request);
  }
  rollback(): Promise<DeploymentRecord> {
    return this.createDeployment(request);
  }
  getLogs(): Promise<readonly []> {
    return Promise.resolve([]);
  }
  destroy(): Promise<void> {
    return Promise.resolve();
  }
}

describe("DeploymentService", () => {
  it("routes a deploy to the provider the resolver selects", async () => {
    const recording = new RecordingProvider();
    const registry = new ProviderRegistry()
      .register(recording)
      .register(new DisconnectedProvider());
    const service = createDeploymentService(registry, () => "recording");

    const record = await service.deploy(request);

    expect(record.status).toBe("ready");
    expect(record.provider).toBe("recording");
    expect(recording.created).toHaveLength(1);
  });

  it("selects the provider from the target, so the host is configuration", async () => {
    const registry = new ProviderRegistry()
      .register(new RecordingProvider())
      .register(new DisconnectedProvider());
    // production goes to the real provider; anything else is not wired yet.
    const service = createDeploymentService(registry, (t) =>
      t.environment === "production" ? "recording" : "disconnected",
    );

    const prod = await service.deploy({
      ...request,
      target: { ...target, environment: "production" },
    });
    const preview = await service.deploy(request);

    expect(prod.status).toBe("ready");
    expect(preview.status).toBe("not-configured");
  });

  it("throws a clear, actionable error for an unregistered provider", () => {
    const service = createDeploymentService(new ProviderRegistry(), () => "nope");
    expect(() => service.deploy(request)).toThrow(UnknownProviderError);
    expect(() => service.deploy(request)).toThrow(/nope/);
  });
});

describe("DisconnectedProvider", () => {
  it("is honest — reports not-configured, never a fake success", async () => {
    const registry = new ProviderRegistry().register(new DisconnectedProvider());
    const service = createDeploymentService(registry, () => "disconnected");

    const record = await service.deploy(request);

    expect(record.status).toBe("not-configured");
    expect(record.url).toBeNull();
    expect(record.detail).toContain("No hosting provider");
  });
});

// Mock social adapter — deterministic, credential-free, PUBLISHES NOTHING.
//
// Honest instrumentation (Principle 10): it returns a clearly-labelled
// external id that could never be mistaken for a real one, and never contacts
// a platform. It exists so the whole claim -> publish -> attempt-log -> rollup
// loop can be exercised without an audience seeing anything.
import {
  nowIso,
  type PublishOutcome,
  type PublishTarget,
  type SocialAdapter,
  type SocialPlatform,
} from "./provider.ts";

export class MockSocialAdapter implements SocialAdapter {
  constructor(
    readonly platform: SocialPlatform,
    private readonly outcome: "success" | "failure" = "success",
  ) {}

  publish(target: PublishTarget): Promise<PublishOutcome> {
    const startedAt = nowIso();
    if (this.outcome === "failure") {
      return Promise.resolve({
        status: "failed",
        terminal: false,
        error: "mock: forced failure",
        attempts: [
          {
            phase: "publish",
            ok: false,
            startedAt,
            httpStatus: 500,
            error: "mock: forced failure",
          },
        ],
      });
    }
    // Deterministic from the idempotency key, and unmistakably fake.
    let h = 0;
    for (let i = 0; i < target.idempotencyKey.length; i++) {
      h = (h * 31 + target.idempotencyKey.charCodeAt(i)) | 0;
    }
    const id = `mock-${this.platform}-${(h >>> 0).toString(16)}`;
    return Promise.resolve({
      status: this.platform === "tiktok_inbox" ? "delivered_to_inbox" : "published",
      externalPostId: id,
      terminal: false,
      attempts: [{ phase: "publish", ok: true, startedAt, httpStatus: 200 }],
    });
  }
}

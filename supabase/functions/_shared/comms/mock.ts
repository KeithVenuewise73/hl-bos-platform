// Mock communications provider — deterministic, credential-free, sends NOTHING.
//
// Honest instrumentation (Principle 10): the mock returns a clearly-labelled
// provider reference and never contacts a real email/SMS service. Used locally
// and in tests so the whole request→render→queue path is exercised without
// sending a real message.
import type {
  CommsChannel,
  CommsProvider,
  SendRequest,
  SendResult,
} from "./provider.ts";

export class MockCommsProvider implements CommsProvider {
  readonly key: string;
  constructor(readonly channel: CommsChannel) {
    this.key = channel === "sms" ? "mock_sms" : "mock_email";
  }

  send(req: SendRequest): Promise<SendResult> {
    // deterministic ref from the recipient + body length; NOT a real send
    const stamp = `${req.to}:${req.body.length}`;
    let h = 0;
    for (let i = 0; i < stamp.length; i++) h = (h * 31 + stamp.charCodeAt(i)) | 0;
    return Promise.resolve({
      providerMessageRef: `mock-${this.channel}-${(h >>> 0).toString(16)}`,
    });
  }
}

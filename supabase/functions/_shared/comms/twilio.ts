// Twilio SMS adapter (Checkpoint 3 scaffolding — INERT until a key is granted).
//
// Reads its auth token only through the Vault resolver, by reference
// ("vault:twilio_auth_token"). Real HTTP send is a deploy-time TODO; today it
// resolves the secret (proving the wiring) and throws a typed, secret-free
// error so a comms worker records the message failed rather than fabricating a
// success. The resolved token is never returned, logged, or embedded in errors.
import type {
  CommsProvider,
  SecretResolver,
  SendRequest,
  SendResult,
} from "./provider.ts";

export class TwilioProvider implements CommsProvider {
  readonly key = "twilio";
  readonly channel = "sms" as const;
  constructor(
    private readonly credentialRef: string, // e.g. "vault:twilio_auth_token"
    private readonly resolve: SecretResolver,
  ) {}

  async send(_req: SendRequest): Promise<SendResult> {
    // Resolve (and immediately discard) to prove the Vault wiring; never leak it.
    await this.resolve(this.credentialRef);
    throw new Error("twilio_not_configured");
  }
}

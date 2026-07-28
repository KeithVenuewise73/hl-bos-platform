// Transactional email adapter (Checkpoint 3 scaffolding — INERT until a
// provider is chosen and its key granted). Provider selection is a CEO decision
// (see the Provider & Secret Configuration Guide); the interface is ready so
// swapping in Resend/SES/Postmark is a one-file change. Reads its key only via
// the Vault resolver; never leaks it.
import type {
  CommsProvider,
  SecretResolver,
  SendRequest,
  SendResult,
} from "./provider.ts";

export class EmailProvider implements CommsProvider {
  readonly key = "email";
  readonly channel = "email" as const;
  constructor(
    private readonly credentialRef: string, // e.g. "vault:email_api_key"
    private readonly resolve: SecretResolver,
  ) {}

  async send(_req: SendRequest): Promise<SendResult> {
    await this.resolve(this.credentialRef);
    throw new Error("email_provider_not_configured");
  }
}

// HL-BOS communications provider abstraction (Checkpoint 3 scaffolding).
//
// One interface in front of every channel/provider. A comms worker selects an
// adapter by comms.providers.kind and never imports a vendor SDK elsewhere.
// Credentials are resolved from Vault by reference (comms.providers.credential_ref,
// e.g. "vault:twilio_auth_token") — never read from the database, never hard-coded.
//
// The MockProvider needs no credentials and is used locally. Twilio/email are
// real adapters but INERT until a key is granted at deploy.

export type CommsChannel = "email" | "sms";

export interface SendRequest {
  channel: CommsChannel;
  to: string;
  from?: string;
  subject?: string; // email only
  body: string;
}

export interface SendResult {
  providerMessageRef: string; // external id, never a secret
}

export interface CommsProvider {
  readonly key: string;
  readonly channel: CommsChannel;
  send(req: SendRequest): Promise<SendResult>;
}

export type SecretResolver = (vaultRef: string) => Promise<string>;

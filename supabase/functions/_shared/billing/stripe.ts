// Stripe adapter (INERT). Reads its signing secret from Supabase Vault by
// reference; never holds a literal secret. verifyAndNormalize is a stub here —
// real signature verification (Stripe-Signature HMAC) is wired at deploy time.
//
// STRUCTURAL SCAFFOLDING — not deployed, not runtime-tested in this change.

import type { NormalizedBillingEvent, PaymentProvider } from "./provider.ts";

export class StripeProvider implements PaymentProvider {
  readonly key = "stripe";

  constructor(
    // e.g. "vault:stripe_webhook_secret" — resolved by the caller, not stored.
    private readonly webhookSecretRef: string,
    private readonly resolveSecret: (vaultRef: string) => Promise<string>,
  ) {}

  async verifyAndNormalize(
    rawBody: string,
    signature: string | null,
  ): Promise<NormalizedBillingEvent> {
    if (!signature) throw new Error("missing_signature");
    // At deploy: resolve the secret and verify the Stripe-Signature HMAC before
    // trusting anything in rawBody. Until then this adapter is inert.
    await this.resolveSecret(this.webhookSecretRef);
    throw new Error("stripe_provider_not_configured");
  }
}

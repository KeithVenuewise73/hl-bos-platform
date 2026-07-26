// Payment-provider abstraction for the HL-BOS billing platform.
//
// Products never talk to a provider. The billing-webhook edge function receives
// a provider callback, a PaymentProvider verifies + normalizes it, and the
// result is mapped onto the billing.* SECURITY DEFINER RPCs. Adding a provider
// (Paddle, Braintree, …) is a new adapter, not a change to any product.
//
// STRUCTURAL SCAFFOLDING — not deployed, not runtime-tested in this change.

export type BillingEventKind =
  | "payment.succeeded"
  | "payment.failed"
  | "subscription.renewed"
  | "subscription.canceled"
  | "unknown";

export interface NormalizedBillingEvent {
  kind: BillingEventKind;
  providerKey: string;
  // External references only — never secrets.
  providerSubscriptionRef: string | null;
  providerInvoiceRef: string | null;
  providerPaymentRef: string | null;
  amountMinor: number | null;
  currency: string | null;
  failureReason: string | null;
  periodEnd: string | null;
}

export interface PaymentProvider {
  readonly key: string;
  // Verify the webhook signature against the provider's signing secret
  // (resolved from Vault by reference) and normalize the payload. Throws on an
  // invalid signature — an unverifiable event must never reach the RPCs.
  verifyAndNormalize(
    rawBody: string,
    signature: string | null,
  ): Promise<NormalizedBillingEvent>;
}

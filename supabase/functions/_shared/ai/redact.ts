// Secret redaction for AI-gateway logs and error responses (Stage A V0).
//
// The database stores credentials only as Vault references, never values
// (enforced by CHECK constraints). This is the RUNTIME half: before any string
// is put into a log line or an HTTP error body, scrub the shapes a real key or
// token could take, plus any explicit secret values the caller knows about
// (e.g. a value just resolved from Vault). Fails safe: unknown text passes
// through, known secret shapes are masked.

const MASK = "[REDACTED]";

// Known credential shapes in the Herman Legacy stack.
const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic API key
  /sb_secret_[A-Za-z0-9]{8,}/g, // Supabase service-role / secret key
  /sbp_[A-Fa-f0-9]{8,}/g, // Supabase personal access token
  /sk_live_[A-Za-z0-9]{8,}/g, // Stripe live secret key
  /sk_test_[A-Za-z0-9]{8,}/g, // Stripe test secret key
  /whsec_[A-Za-z0-9]{8,}/g, // Stripe webhook secret
  /Bearer\s+[A-Za-z0-9._~+/-]{12,}=*/g, // Authorization: Bearer <jwt/token>
  /eyJ[A-Za-z0-9._-]{20,}/g, // bare JWT (header.payload.sig)
];

/**
 * Return `input` with known secret shapes and any `extraSecrets` masked.
 * `extraSecrets` lets a caller redact a specific value it holds (e.g. a key
 * just resolved from Vault) even if its shape is not in PATTERNS.
 */
export function redact(input: string, extraSecrets: string[] = []): string {
  let out = input;
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 4) {
      out = out.split(secret).join(MASK);
    }
  }
  for (const re of PATTERNS) {
    out = out.replace(re, MASK);
  }
  return out;
}

// Runtime secret redaction for the social publishing path.
//
// social.publish_attempts stores the request alongside the response, and the
// request to every one of these platforms carries an access token. The table
// is append-only, so a token written there once is written there forever. This
// scrubs it first.
//
// Reuses the platform's existing redactor and adds the social token shapes on
// top rather than forking a second copy of the same list.
import { redact as baseRedact } from "../ai/redact.ts";

const MASK = "[REDACTED]";

const SOCIAL_PATTERNS: RegExp[] = [
  /EAA[A-Za-z0-9]{20,}/g, // Meta (Facebook / Instagram) access token
  /AQV[A-Za-z0-9_-]{20,}/g, // LinkedIn access token
  /act\.[A-Za-z0-9!*_-]{20,}/g, // TikTok access token
  /\baccess_token=[^&\s"']+/g, // token in a Graph API query string
  /\bclient_secret=[^&\s"']+/g, // app secret in a token-exchange call
];

export function redactSocial(input: string, extraSecrets: string[] = []): string {
  let out = baseRedact(input, extraSecrets);
  for (const re of SOCIAL_PATTERNS) out = out.replace(re, MASK);
  return out;
}

/**
 * Deep-redact a value destined for social.publish_attempts.request /
 * .response. Returns a new structure; the original is untouched.
 *
 * Fails CLOSED on anything it cannot serialise: an unserialisable object is
 * replaced with a marker rather than passed through, because "we could not
 * inspect it" must never mean "we logged it raw".
 */
export function redactPayload(value: unknown, extraSecrets: string[] = []): unknown {
  if (value === null || value === undefined) return null;
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return { redaction: "payload_not_serialisable" };
  }
  if (json === undefined) return null;
  const cleaned = redactSocial(json, extraSecrets);
  try {
    return JSON.parse(cleaned);
  } catch {
    return { redaction: "payload_not_parseable_after_redaction" };
  }
}

/**
 * The content security policy, and why it is a function of a nonce.
 *
 * THIS FILE EXISTS BECAUSE OF A BUG THAT REACHED PRODUCTION IN A SIBLING APP.
 * A static `script-src 'self'` blocks Next's own inline bootstrap and flight
 * scripts, so the App Router never hydrates and every client form is inert. The
 * page still renders -- the HTML is produced on the server -- so it looks
 * completely fine and is completely dead: no button has a handler, and a
 * submit falls through to a native form post that reloads the page.
 *
 * Nothing catches that. The build is clean, the typecheck is clean, the tests
 * pass and the page returns 200 with the form on it. Serving a form is not the
 * same as the form working.
 *
 * A nonce must differ on every request, which a static header in next.config.ts
 * cannot do -- so the policy is built here and set in middleware. It is a
 * separate module so the rule can be asserted by a test rather than only by
 * deploying and clicking.
 */

/** A fresh nonce. Edge-runtime safe: no Buffer, which does not exist there. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * `'strict-dynamic'` means a browser that understands it ignores `'self'` and
 * trusts only the nonced scripts plus whatever those load -- which is exactly
 * how Next loads its chunks. `'self'` stays for older browsers, which ignore
 * `'strict-dynamic'` instead. There is deliberately NO `'unsafe-inline'`: it
 * would also fix hydration, and would hand any injected string the ability to
 * execute.
 */
export function policy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://*.supabase.co",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

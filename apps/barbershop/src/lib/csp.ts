/**
 * The content security policy, and why it is a function of a nonce.
 *
 * THIS FILE EXISTS BECAUSE OF A DEPLOYED BUG. The app's first deployment
 * carried a static `script-src 'self'`, copied from the Executive Portal.
 * Next's App Router bootstraps hydration with INLINE `self.__next_f.push(...)`
 * scripts, and a policy naming neither a nonce nor 'unsafe-inline' blocks every
 * one of them. The page still rendered -- the HTML is produced on the server --
 * so it looked completely fine and was completely dead: React never hydrated,
 * so no button had a handler. Pressing "Sign in" fell through to a native form
 * submit and reloaded the page. Nothing in the build, the typecheck, the tests
 * or the deployment log said a word about it.
 *
 * It is a separate module from the middleware so that the rule can be asserted
 * by a test rather than only by deploying and clicking.
 */

/** A fresh nonce. Edge-runtime safe: no Buffer, which does not exist there. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * `'strict-dynamic'` means a browser that understands it ignores `'self'` and
 * trusts only the nonced scripts plus whatever those load -- which is exactly
 * how Next loads its chunks. `'self'` stays for older browsers, which ignore
 * `'strict-dynamic'` instead.
 */
export function policy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    // The only host this app talks to.
    "connect-src 'self' https://*.supabase.co",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

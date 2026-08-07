import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Content-Security-Policy — nonce-based, one authoritative source (here).
//
// The site is fully public with no auth. It still ships a small client bundle
// (the responsive navigation hydrates so the mobile menu can open/close), so a
// static `script-src 'self'` would block Next.js's own inline bootstrap and the
// menu would be inert. We mint a fresh nonce per request and hand it to Next via
// the request CSP header, which Next reads to nonce its framework scripts;
// `'strict-dynamic'` then lets those trusted scripts load the chunked bundles.
// The policy stays strict: NO `script-src 'unsafe-inline'`. This mirrors the
// established Herman Legacy Digital pattern, minus the auth gating that site has.
// ---------------------------------------------------------------------------
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function middleware(req: NextRequest): NextResponse {
  const nonce = makeNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

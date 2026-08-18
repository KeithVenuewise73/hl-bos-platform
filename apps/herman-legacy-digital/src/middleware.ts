import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { devBypassEnabled } from "@/lib/access";
import { devInternalRoleFromEnv, roleFromClaims, isInternal } from "@/lib/authz";

// The public marketing site is unauthenticated. Two internal areas are gated,
// with DIFFERENT audiences:
//   /portal/*        -> any authenticated user; anonymous -> /login
//   /intelligence/*  -> internal HLD roles only; anonymous -> /admin-login,
//                       authenticated client-only -> /portal (also re-checked +
//                       shown an access-denied state on the page itself).
const CLIENT_PREFIX = "/portal";
const BTIC_PREFIX = "/intelligence";
// HLVS (Venture Studio) mounts inside this same app at /HLVS and reuses the
// SAME internal-role gate as BTIC. No second identity system, no second login.
const HLVS_PREFIX = "/HLVS";

// ---------------------------------------------------------------------------
// Content-Security-Policy — nonce-based, one authoritative source (here).
//
// A static `script-src 'self'` blocks Next.js's own inline bootstrap/flight
// scripts, so the App Router never hydrates and every client form is inert. We
// mint a fresh nonce per request and hand it to Next (via the request CSP
// header, which Next reads to nonce its framework scripts). `'strict-dynamic'`
// then lets those trusted scripts load the chunked bundles. The policy stays
// strict: NO `script-src 'unsafe-inline'`, and every other directive is
// unchanged from the previous config. This is the minimum correction that makes
// /login, /admin-login, /forgot-password, /reset-password and the intake forms
// interactive in production.
// ---------------------------------------------------------------------------
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://*.supabase.co",
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

function makeClient(req: NextRequest, res: NextResponse) {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options),
        );
      },
    },
  });
}

function redirectTo(
  req: NextRequest,
  pathname: string,
  withNext: boolean,
  csp: string,
): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (withNext) url.searchParams.set("next", req.nextUrl.pathname);
  const res = NextResponse.redirect(url);
  res.headers.set("content-security-policy", csp);
  return res;
}

export async function middleware(req: NextRequest) {
  // Per-request nonce + CSP, applied to every response (and forwarded to the
  // app so Next.js nonces its scripts).
  const nonce = makeNonce();
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("content-security-policy", csp);
    return res;
  };

  const { pathname } = req.nextUrl;
  const isBtic =
    pathname.startsWith(BTIC_PREFIX) || pathname.startsWith(HLVS_PREFIX);
  const isPortal = pathname.startsWith(CLIENT_PREFIX);

  // Public + auth pages (login, admin-login, forgot/reset-password, marketing):
  // no gate, just the CSP.
  if (!isBtic && !isPortal) return pass();

  // ---- BTIC: internal-role gate --------------------------------------------
  if (isBtic) {
    // Local-only dev role bypass (impossible in production — see authz.ts).
    if (
      devInternalRoleFromEnv({
        nodeEnv: process.env["NODE_ENV"],
        hlBosEnv: process.env["HL_BOS_ENV"],
        devRole: process.env["HLD_DEV_ROLE"],
      })
    ) {
      return pass();
    }

    const res = pass();
    const supabase = makeClient(req, res);
    if (!supabase) return redirectTo(req, "/admin-login", true, csp);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return redirectTo(req, "/admin-login", true, csp);

    const role = roleFromClaims(user.app_metadata, { authenticated: true });
    if (!isInternal(role)) {
      // Authenticated but client-only: not permitted into BTIC. Send to the
      // client portal (the page also renders an access-denied state).
      return redirectTo(req, "/portal", false, csp);
    }
    return res;
  }

  // ---- Portal: any authenticated user --------------------------------------
  if (
    devBypassEnabled({
      nodeEnv: process.env["NODE_ENV"],
      hlBosEnv: process.env["HL_BOS_ENV"],
      devClient: process.env["HLD_DEV_CLIENT"],
    })
  ) {
    return pass();
  }

  const res = pass();
  const supabase = makeClient(req, res);
  let authenticated = false;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);
  }
  if (!authenticated) return redirectTo(req, "/login", true, csp);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { newNonce, policy } from "@/lib/csp";

// Public paths that never require a session.
const PUBLIC = ["/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * The authentication gate, the one place tokens are written back, and now the
 * one place the security policy is set.
 *
 * DELIBERATELY WITHOUT A DEV BYPASS. The Executive Portal has one, guarded so
 * it cannot exist in production; this app is a customer-facing surface holding
 * a shop's own data, and a bypass that has to be correctly guarded is a bypass
 * that can be incorrectly guarded. Sign in, or see nothing.
 *
 * This is a gate, not the authorization. What a signed-in barber may actually
 * do is decided by the database on every call.
 */
export async function middleware(req: NextRequest) {
  const nonce = newNonce();
  const csp = policy(nonce);

  // Next reads the nonce out of the CSP on the REQUEST headers and applies it
  // to every script tag it emits. Without this the response header would name
  // a nonce that nothing on the page carries, which is the same as blocking
  // everything.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const { pathname } = req.nextUrl;
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);

  if (isPublic(pathname)) return res;

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

  let authenticated = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);
  }

  if (!authenticated) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set("content-security-policy", csp);
    return redirect;
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

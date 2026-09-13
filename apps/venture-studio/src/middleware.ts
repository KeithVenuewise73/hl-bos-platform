import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { devRoleFromEnv } from "@/lib/access";
import { newNonce, policy } from "@/lib/csp";

const PUBLIC = ["/login", "/api/health"];
function isPublic(p: string): boolean {
  return PUBLIC.some((x) => p === x || p.startsWith(x + "/"));
}

// Auth gate. Unauthenticated requests to any non-public route redirect to /login.
// Per-role authorization is enforced again server-side in each page/route.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The nonce is minted here and mirrored onto the REQUEST headers, which is
  // what makes Next stamp the same value onto its own script tags. Every
  // response below carries the matching policy -- including the public paths
  // and the dev bypass, which previously returned early with no policy at all.
  const nonce = newNonce();
  const csp = policy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const pass = () => {
    const r = NextResponse.next({ request: { headers: requestHeaders } });
    r.headers.set("content-security-policy", csp);
    return r;
  };

  if (isPublic(pathname)) return pass();

  const dev = devRoleFromEnv({
    nodeEnv: process.env["NODE_ENV"],
    hlBosEnv: process.env["HL_BOS_ENV"],
    devRole: process.env["VSTUDIO_DEV_ROLE"],
  });
  if (dev) return pass();

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const res = pass();
  let authed = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authed = Boolean(user);
  }
  if (!authed) {
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

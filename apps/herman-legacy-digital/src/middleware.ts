import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { devBypassEnabled } from "@/lib/access";

// The public marketing site is unauthenticated. ONLY the client portal is gated.
const PROTECTED_PREFIX = "/portal";

/**
 * Authentication gate for the client portal. Unauthenticated requests to
 * `/portal/*` are redirected to /login (they receive no portal content).
 * Everything else — the public site, intake API, health — is public.
 * Reuses HL-BOS identity; no new auth system.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith(PROTECTED_PREFIX)) return NextResponse.next();

  if (
    devBypassEnabled({
      nodeEnv: process.env["NODE_ENV"],
      hlBosEnv: process.env["HL_BOS_ENV"],
      devClient: process.env["HLD_DEV_CLIENT"],
    })
  ) {
    return NextResponse.next();
  }

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const res = NextResponse.next();
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
    return NextResponse.redirect(loginUrl);
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

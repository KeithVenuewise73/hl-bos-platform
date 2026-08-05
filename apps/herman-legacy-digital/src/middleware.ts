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
): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (withNext) url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isBtic = pathname.startsWith(BTIC_PREFIX);
  const isPortal = pathname.startsWith(CLIENT_PREFIX);
  if (!isBtic && !isPortal) return NextResponse.next();

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
      return NextResponse.next();
    }

    const res = NextResponse.next();
    const supabase = makeClient(req, res);
    if (!supabase) return redirectTo(req, "/admin-login", true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return redirectTo(req, "/admin-login", true);

    const role = roleFromClaims(user.app_metadata, { authenticated: true });
    if (!isInternal(role)) {
      // Authenticated but client-only: not permitted into BTIC. Send to the
      // client portal (the page also renders an access-denied state).
      return redirectTo(req, "/portal", false);
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
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = makeClient(req, res);
  let authenticated = false;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);
  }
  if (!authenticated) return redirectTo(req, "/login", true);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

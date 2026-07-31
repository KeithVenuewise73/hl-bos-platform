import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { devRoleFromEnv } from "@/lib/access";

// Public paths that never require authentication.
const PUBLIC = ["/login", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Authentication gate. Unauthenticated requests to any non-public route are
 * redirected to /login — they receive no portal content. Per-role authorization
 * is enforced again server-side in each route (defense in depth).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Local dev bypass (impossible in production — see access.ts).
  const dev = devRoleFromEnv({
    nodeEnv: process.env["NODE_ENV"],
    hlBosEnv: process.env["HL_BOS_ENV"],
    devRole: process.env["PORTAL_DEV_ROLE"],
  });
  if (dev) return NextResponse.next();

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
          // Refresh rotated tokens onto the response.
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

// Run on everything except Next internals and static files.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

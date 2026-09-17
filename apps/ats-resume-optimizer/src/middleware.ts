import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { deploymentMode } from "@/lib/deployment.ts";

/**
 * The request gate.
 *
 * Three outcomes, decided by `deploymentMode`:
 *
 *   local         — one operator at their own machine; pass everything through.
 *   authenticated — every non-public route requires a signed-in user.
 *   refuse        — deployed with no identity provider: serve the refusal page
 *                   and nothing else. This is the case that must never quietly
 *                   degrade into "local", because the data here is one person's
 *                   entire employment history.
 *
 * Pages and route handlers check the viewer again server-side. This gate is the
 * outer fence, not the only one.
 */

const PUBLIC = ["/login", "/api/health", "/unavailable"];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const mode = deploymentMode({
    hlBosEnv: process.env["HL_BOS_ENV"],
    nodeEnv: process.env["NODE_ENV"],
    supabaseUrl: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    supabaseKey: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  });

  if (mode === "refuse") {
    if (pathname === "/unavailable" || pathname === "/api/health")
      return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/unavailable";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (mode === "local") return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const res = NextResponse.next();
  let authenticated = false;

  if (url !== undefined && key !== undefined) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(list) {
          for (const { name, value, options } of list) {
            res.cookies.set(name, value, options);
          }
        },
      },
    });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      authenticated = user !== null;
    } catch {
      authenticated = false;
    }
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

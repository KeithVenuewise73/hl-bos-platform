import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { devRoleFromEnv } from "@/lib/access";

const PUBLIC = ["/login", "/api/health"];
function isPublic(p: string): boolean {
  return PUBLIC.some((x) => p === x || p.startsWith(x + "/"));
}

// Auth gate. Unauthenticated requests to any non-public route redirect to /login.
// Per-role authorization is enforced again server-side in each page/route.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const dev = devRoleFromEnv({
    nodeEnv: process.env["NODE_ENV"],
    hlBosEnv: process.env["HL_BOS_ENV"],
    devRole: process.env["VSTUDIO_DEV_ROLE"],
  });
  if (dev) return NextResponse.next();

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const res = NextResponse.next();
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
    return NextResponse.redirect(loginUrl);
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

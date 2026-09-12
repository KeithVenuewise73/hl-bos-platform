import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Public paths. Everything else requires a session.
//
// There is no local development bypass here, unlike apps/executive-portal.
// That app is read-only over a catalog; this one holds film and evaluations of
// minors, and a role-impersonation switch is not a thing to put one env var
// away from production.
const PUBLIC = ["/login", "/api/health", "/setup"];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

  // Not connected to a project yet: send every request to /setup, which
  // explains what is missing. Failing to a page that says why beats failing to
  // a login form that can never succeed.
  if (!url || !key) {
    const setup = req.nextUrl.clone();
    setup.pathname = "/setup";
    return NextResponse.redirect(setup);
  }

  const res = NextResponse.next();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        // Refresh rotated tokens onto the response.
        for (const { name, value, options } of toSet)
          res.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

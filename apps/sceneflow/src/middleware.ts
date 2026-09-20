import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, decideAccess } from "@/lib/access";

/**
 * The door, in front of everything.
 *
 * This has to be middleware rather than a check inside the layout. A layout
 * that renders an unlock screen instead of `children` still runs the page and
 * still ships its rendered output in the response — React has already produced
 * it by then — so a locked visitor would receive the whole page in the payload
 * without it ever being drawn. That was true of the first version of this app,
 * and reading the served HTML is how it was found.
 *
 * Middleware runs before any of that. A locked request is rewritten to the
 * unlock screen and the page it asked for is never rendered at all.
 *
 * The route handlers and server actions behind this still check for
 * themselves (see lib/gate.ts). Two checks, because one of them being wrong
 * should not be the end of it.
 */
export const config = {
  // Node, not Edge: the code lives in a file on this machine, and the Edge
  // runtime has no file system.
  runtime: "nodejs",
  // Everything except Next's own static assets. The health endpoint is
  // deliberately inside the matcher's reach and then let through below.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const CODE_FILE = join(
  process.cwd().replace(/[\\/]apps[\\/]sceneflow[\\/]?$/, ""),
  ".sceneflow",
  "access-code.txt",
);

/** Answerable without the code, so the console can ask "are you up?". */
const OPEN_PATHS = new Set(["/api/health", "/unlock"]);

function configuredCode(): string {
  try {
    return readFileSync(CODE_FILE, "utf-8").trim();
  } catch {
    return "";
  }
}

export function middleware(request: NextRequest): NextResponse {
  if (OPEN_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();

  const access = decideAccess({
    configuredCode: configuredCode(),
    cookieToken: request.cookies.get(ACCESS_COOKIE)?.value ?? "",
  });
  if (access.state !== "locked") return NextResponse.next();

  // An unlock screen is an answer for a browser, not for a route handler.
  // Anything under /api gets the same reply as a photograph that is not there.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // A rewrite, not a redirect: the address bar keeps the page they asked for,
  // so unlocking and reloading lands them where they were going.
  const unlock = request.nextUrl.clone();
  unlock.pathname = "/unlock";
  unlock.search = "";
  return NextResponse.rewrite(unlock);
}

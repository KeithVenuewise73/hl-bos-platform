/**
 * Only DateSort's own page may use DateSort's API.
 *
 * DateSort listens on 127.0.0.1, but any website open in the same browser
 * can still send requests to 127.0.0.1. Without this, a web page could make
 * DateSort scan a folder or pop up a folder window. Two checks:
 *
 *   - Host must be localhost / 127.0.0.1 (defeats DNS rebinding, where an
 *     attacker's domain is re-pointed at 127.0.0.1).
 *   - Origin, when the browser sends one, must be that same host. Browsers
 *     always send Origin on a cross-site POST, and a page cannot forge it.
 *
 * Pure: takes header values, returns the refusal reason or null.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(hostHeader: string): string {
  // "127.0.0.1:4604" -> "127.0.0.1"; "[::1]:4604" -> "[::1]"
  if (hostHeader.startsWith("["))
    return hostHeader.slice(0, hostHeader.indexOf("]") + 1);
  return hostHeader.split(":")[0] ?? "";
}

export function refuseUnlessLocal(headers: {
  host: string | null;
  origin: string | null;
}): string | null {
  if (headers.host === null || !LOCAL_HOSTS.has(hostname(headers.host).toLowerCase())) {
    return "DateSort only answers requests made on this computer.";
  }
  if (headers.origin !== null && headers.origin !== "null") {
    let origin: URL;
    try {
      origin = new URL(headers.origin);
    } catch {
      return "Refused: the request did not come from DateSort's own page.";
    }
    if (origin.host.toLowerCase() !== headers.host.toLowerCase()) {
      return "Refused: the request did not come from DateSort's own page.";
    }
  } else if (headers.origin === "null") {
    return "Refused: the request did not come from DateSort's own page.";
  }
  return null;
}

/** The guard as a Response, for route handlers. Null means "go ahead". */
export function guard(request: Request): Response | null {
  const reason = refuseUnlessLocal({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
  });
  if (reason === null) {
    const type = request.headers.get("content-type") ?? "";
    // JSON only: a plain HTML form cannot send it, and a script on another
    // site cannot send it without a pre-flight check DateSort never approves.
    if (
      request.method === "POST" &&
      !type.toLowerCase().startsWith("application/json")
    ) {
      return Response.json({ error: "Expected JSON." }, { status: 415 });
    }
    return null;
  }
  return Response.json({ error: reason }, { status: 403 });
}

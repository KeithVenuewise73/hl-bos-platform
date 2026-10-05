/**
 * Same-origin check for the app's own POST route handlers.
 *
 * Server actions get this from Next for free; plain route handlers do not.
 * Without it, any web page the user visits could post a file into an event
 * or start a download in the background. A missing Origin is refused too:
 * every browser sends one on a cross-origin POST, so its absence is not a
 * reason to trust the request.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin === null || host === null) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * A 303 back to one of this app's own pages, as a RELATIVE Location.
 *
 * Not `new URL(path, request.url)`: behind `next start` request.url reports
 * the host as "localhost" while the app listens on 127.0.0.1, so an absolute
 * redirect built from it sends the browser to a different origin — which is
 * how the first version of the upload form broke. A relative Location always
 * resolves against the address the person actually typed.
 */
export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}

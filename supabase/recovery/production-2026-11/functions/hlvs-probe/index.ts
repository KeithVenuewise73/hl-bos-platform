// Header-negotiation probe. Returns tiny HTML using an explicit Headers object.
const H = '<!doctype html><html><body><h1>probe</h1></body></html>';
Deno.serve(() => {
  const h = new Headers();
  h.set("content-type", "text/html; charset=utf-8");
  h.set("cache-control", "no-store");
  return new Response(H, { status: 200, headers: h });
});

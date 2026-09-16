/**
 * A static server for the exported app, for QA only.
 *
 * Deliberately tiny and dependency-free: the thing under test is a folder of
 * files, and a real deployment (or a native shell) serves it the same way.
 *
 * Used both by `pnpm start` (so the Development Control Center can launch this
 * app without anybody opening a terminal) and by the acceptance run. Serving
 * the export with `npx serve` would need a network at the moment of starting,
 * which is a strange dependency for an app whose whole point is working
 * without one.
 *
 *   node scripts/serve.mjs out 4700
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] ?? 4700);
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

const handler = async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  try {
    const s = await stat(file).catch(() => null);
    if (s?.isDirectory()) file = path.join(file, "index.html");
    else if (!s && !path.extname(file)) file = `${file}.html`;
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    try {
      const body = await readFile(path.join(ROOT, "404.html"));
      res.writeHead(404, { "content-type": "text/html" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  }
};

/*
 * Loopback only, on BOTH families.
 *
 * Binding 0.0.0.0 would put a coach's roster on whatever network the machine
 * is attached to, which this has no business doing. But binding 127.0.0.1
 * alone is not enough either: "localhost" resolves to ::1 first on plenty of
 * systems, so the Control Center's health probe would report the app as not
 * running while it sat there serving perfectly.
 */
for (const host of ["127.0.0.1", "::1"]) {
  createServer(handler)
    .listen(PORT, host)
    .on("error", (err) => {
      // A missing IPv6 loopback is normal in some containers, and is not a
      // reason to fail: the other listener is already serving.
      if (err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT") return;
      console.error(`could not listen on ${host}:${PORT} — ${err.message}`);
      process.exitCode = 1;
    });
}
console.log(`serving ${ROOT} on http://localhost:${PORT}`);

/**
 * A static server for the exported app, for QA only.
 *
 * Deliberately tiny and dependency-free: the thing under test is a folder of
 * files, and a real deployment (or a native shell) serves it the same way.
 *
 *   node qa/serve.mjs out 4700
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] ?? 4700);
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  try {
    const s = await stat(file).catch(() => null);
    if (s?.isDirectory()) file = path.join(file, "index.html");
    else if (!s && !path.extname(file)) file = `${file}.html`;
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
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
}).listen(PORT, () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`));

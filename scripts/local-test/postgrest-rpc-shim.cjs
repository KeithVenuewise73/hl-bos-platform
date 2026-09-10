// A stand-in for PostgREST's /rest/v1/rpc/ endpoint, backed by the local
// PostgreSQL mirror. Used only by site-serve-e2e.mjs, to run the real `site`
// edge function against the real SQL functions.
//
// TWO THINGS IT DOES THAT MATTER:
//
//   * it runs every call as the `anon` ROLE, in a transaction, exactly as
//     PostgREST does for an anonymous request. If it connected as postgres the
//     end-to-end test would prove the SQL works and say nothing about whether
//     a stranger may call it -- which is the whole question.
//   * it will only call the two functions the migration exposes. A shim that
//     ran whatever it was asked would be testing a door that is wider than the
//     real one.
const http = require("http");
const pg = require("pg");

const ALLOWED = {
  barberos_published_site: ["p_slug"],
  barberos_published_sitemap: [],
};

const c = new pg.Client({
  host: "/tmp",
  port: 5433,
  user: "postgres",
  database: "hlbos",
});

async function main(port) {
  await c.connect();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      const m = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(req.url || "");
      const fn = m && m[1];
      if (!fn || !(fn in ALLOWED)) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ message: "no such function" }));
      }
      const names = ALLOWED[fn];
      const args = JSON.parse(body || "{}");
      const values = names.map((n) => args[n] ?? null);
      const params = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
      try {
        await c.query("begin");
        await c.query("set local role anon");
        const r = await c.query(`select public.${fn}(${params}) as out`, values);
        await c.query("commit");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(r.rows[0].out));
      } catch (e) {
        await c.query("rollback").catch(() => {});
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: String(e) }));
      }
    });
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return server;
}

module.exports = { main };

if (require.main === module) {
  main(Number(process.argv[2] || 4556)).then((s) =>
    console.log("rpc shim on", s.address().port),
  );
}

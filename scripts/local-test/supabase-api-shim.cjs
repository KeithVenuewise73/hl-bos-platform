// A stand-in for the Supabase Management API's SQL endpoint, backed by the
// local PostgreSQL mirror. Used ONLY to render the console page against real
// data during verification. Not shipped, not imported by anything.
const http = require("http");
const pg = require("pg");
const c = new pg.Client({
  host: "/tmp",
  port: 5433,
  user: "postgres",
  database: "hlbos",
});
c.connect();
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      try {
        const { query } = JSON.parse(body);
        const r = await c.query(query);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(r.rows));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: String(e) }));
      }
    });
  })
  .listen(4555, () => console.log("shim on 4555"));

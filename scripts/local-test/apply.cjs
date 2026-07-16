const pg = require("pg");
const fs = require("fs");
const path = require("path");
(async () => {
  const admin = new pg.Client({
    host: "/tmp",
    port: 5433,
    user: "postgres",
    database: "postgres",
  });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS hlbos");
  await admin.query("CREATE DATABASE hlbos");
  await admin.end();

  const c = new pg.Client({
    host: "/tmp",
    port: 5433,
    user: "postgres",
    database: "hlbos",
  });
  await c.connect();
  // Deliberately do NOT create pgcrypto here. 0001 owns it and puts it in the
  // `extensions` schema. Creating it in public first made 0001's
  // "IF NOT EXISTS" a silent no-op, leaving extensions.digest() undefined --
  // which plpgsql only discovers at RUNTIME, not at apply time.
  // The shim's auth.users default uses pg_catalog.gen_random_uuid (core since PG13).
  const shim = fs.readFileSync("/tmp/pgtest/supabase-shim.sql", "utf8");
  await c.query(shim);
  console.log("shim applied: Supabase roles + auth schema + auth.uid()");

  const files = fs
    .readdirSync("/tmp/pgtest")
    .filter((f) => /^\d{14}_hlbos_.*\.sql$/.test(f))
    .sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join("/tmp/pgtest", f), "utf8");
    try {
      await c.query(sql);
      console.log("APPLIED  " + f);
    } catch (e) {
      console.log("FAILED   " + f);
      console.log("  " + e.message);
      if (e.position) console.log("  at char " + e.position);
      await c.end();
      process.exit(1);
    }
  }
  await c.end();
})().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});

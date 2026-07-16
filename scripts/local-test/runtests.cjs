// Local pgTAP runner.
//
// Mirrors `supabase test db` (pg_prove) closely enough to be trustworthy:
//   * every *.sql in supabase/tests is a test; *.inc files are not
//   * each test file is self-contained -- the CLI wraps each test in its own
//     transaction and rolls it back, so fixtures cannot be loaded once globally
//
// Difference: node-postgres has no psql meta-commands, so \ir is expanded here.
// That keeps ONE set of test files working under both runners.
const pg = require("pg");
const fs = require("fs");
const path = require("path");

const DIR = "/tmp/pgtest/tests";

const expand = (sql) =>
  sql.replace(/^\\ir\s+(\S+)\s*$/gm, (_m, inc) =>
    fs.readFileSync(path.join(DIR, inc), "utf8"),
  );

(async () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let pass = 0;
  let fail = 0;
  const failed = [];

  for (const f of files) {
    const c = new pg.Client({
      host: "/tmp",
      port: 5433,
      user: "postgres",
      database: "hlbos",
    });
    await c.connect();

    let out;
    try {
      out = await c.query(expand(fs.readFileSync(path.join(DIR, f), "utf8")));
    } catch (e) {
      console.log(`\n### ${f}\nSQL ERROR: ${e.message}`);
      fail++;
      await c.end();
      continue;
    }

    const rows = []
      .concat(...out.filter((r) => r && r.rows).map((r) => r.rows))
      .map((r) => Object.values(r)[0])
      .filter((v) => typeof v === "string");

    console.log(`\n### ${f}`);
    for (const line of rows) {
      if (/^ok \d/.test(line)) {
        pass++;
        console.log("  " + line);
      } else if (/^not ok \d/.test(line)) {
        fail++;
        failed.push(f + ": " + line);
        console.log("  " + line);
      } else if (line.trim().startsWith("#")) {
        console.log("  " + line);
      }
    }
    await c.end();
  }

  console.log("\n========================================");
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  if (failed.length) {
    console.log("\nFAILURES:");
    failed.forEach((x) => console.log("  " + x));
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log("RUNNER ERR:", e.message);
  process.exit(1);
});

// PR #114's comms.dev_dispatch_mock: the bypass, demonstrated, and the proposed fix
// (supabase/proposed/pr114-fixes/dev_dispatch_mock_guard.sql), on an isolated database
// with #114's migration file applied. Runs when HLBOS_LOCAL_PG is set.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { psql, type LocalPg } from "./local-pg.ts";

const ENV = process.env["HLBOS_LOCAL_PG"];
const ROOT = path.resolve(import.meta.dirname, "../../..");
const T = "00000000-0000-4000-8000-0000000000d1";

describe.skipIf(!ENV)("PR #114 mock dispatch", () => {
  const i = (ENV ?? "/tmp:0").lastIndexOf(":");
  const pg: LocalPg = {
    host: (ENV ?? "/tmp:0").slice(0, i),
    port: (ENV ?? "/tmp:0").slice(i + 1),
    user: "postgres",
    database: "hlbos_pr114_test",
  };
  const db = (sql: string) => psql(pg, sql).trim();
  const queue = (provider: string, key: string) =>
    db(`insert into comms.messages (tenant_id, source_module, channel, to_contact, status, provider_key, idempotency_key, body)
        values ('${T}', 'test', 'email', 'x@example.test', 'queued', '${provider}', '${key}', 'hello') returning id`);
  const dispatch = () =>
    db(`set hlbos.allow_mock_transport = 'on'; select comms.dev_dispatch_mock(100);`)
      .split("\n")
      .pop();

  beforeAll(() => {
    psql(
      pg,
      `drop database if exists ${pg.database};\ncreate database ${pg.database};`,
      "postgres",
    );
    psql(
      pg,
      readFileSync(path.join(ROOT, "scripts/local-test/supabase-shim.sql"), "utf8"),
    );
    const dir = path.join(ROOT, "supabase/migrations");
    for (const f of readdirSync(dir)
      .filter((x) => x.endsWith(".sql"))
      .sort())
      psql(
        pg,
        readFileSync(path.join(dir, f), "utf8").replace(
          /create extension if not exists pgtap[^;]*;/gi,
          "",
        ),
      );
    // PR #114's file, exactly as it is on its branch
    psql(
      pg,
      execFileSync(
        "git",
        [
          "-C",
          ROOT,
          "show",
          "origin/feat/salonos-v1:supabase/migrations/20261110100100_hlbos_0056_comms_enqueue_internal.sql",
        ],
        { encoding: "utf8" },
      ),
    );
    psql(
      pg,
      `insert into platform.tenants (id, slug, name, status) values ('${T}', 'pr114-test', 'PR 114 test', 'active');`,
    );
  }, 300_000);

  it("AS WRITTEN in #114: a message for the REAL email provider is recorded as sent, and its provider is erased", () => {
    const real = queue("email", "real-1");
    dispatch();
    expect(
      db(`select status||'|'||provider_key from comms.messages where id='${real}'`),
    ).toBe("sent|mock");
  });

  it("WITH THE FIX: only mock-provider messages are dispatched; real ones stay queued with their provider", () => {
    psql(
      pg,
      readFileSync(
        path.join(ROOT, "supabase/proposed/pr114-fixes/dev_dispatch_mock_guard.sql"),
        "utf8",
      ),
    );
    const real = queue("email", "real-2");
    const mock = queue("mock_email", "mock-1");
    db(
      `insert into comms.messages (tenant_id, source_module, channel, to_contact, status, provider_key, idempotency_key) values ('${T}','test','email','y@example.test','pending','mock_email','pending-1')`,
    );
    expect(dispatch()).toBe("1");
    expect(
      db(`select status||'|'||provider_key from comms.messages where id='${real}'`),
    ).toBe("queued|email");
    expect(
      db(`select status||'|'||provider_key from comms.messages where id='${mock}'`),
    ).toBe("sent|mock_email");
    expect(
      db(`select status from comms.messages where idempotency_key='pending-1'`),
    ).toBe("pending");
  });

  it("WITH THE FIX and the Revenue Center installed: refused unless release settings allow mock delivery", () => {
    psql(
      pg,
      readFileSync(
        path.join(ROOT, "supabase/proposed/revenue-center/revenue_center_controls.sql"),
        "utf8",
      ),
    );
    queue("mock_email", "mock-2");
    expect(() => dispatch()).toThrow(/mock delivery is disabled in this environment/);
  });
});

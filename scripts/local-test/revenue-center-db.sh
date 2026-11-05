#!/usr/bin/env bash
# Run the Revenue Center persistence tests against a THROWAWAY local PostgreSQL.
# Starts a private server under /var/tmp/hlbos-pg (as an unprivileged user when
# run as root, because initdb refuses root), applies every migration in
# supabase/migrations plus synthetic fixtures, and runs the suite.
# Never connects to a hosted project: the test adapter refuses non-local hosts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGB="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
D=/var/tmp/hlbos-pg
RUN=()
if [ "$(id -u)" = "0" ]; then id pgdev >/dev/null 2>&1 || useradd -m pgdev; RUN=(su pgdev -c); fi
if [ ! -f "$D/data/PG_VERSION" ]; then
  mkdir -p "$D/data" "$D/sock"; [ ${#RUN[@]} -gt 0 ] && chown -R pgdev "$D"
  "${RUN[@]:-bash -c}" "$PGB/initdb -D $D/data --username=postgres --auth=trust >/dev/null"
fi
"${RUN[@]:-bash -c}" "$PGB/pg_ctl -D $D/data -o '-p 54329 -k $D/sock' -l $D/pg.log status >/dev/null || $PGB/pg_ctl -D $D/data -o '-p 54329 -k $D/sock' -l $D/pg.log start >/dev/null"
cd "$ROOT/packages/growth-intelligence"
HLBOS_LOCAL_PG="$D/sock:54329" npx vitest run src/revenue-center.db.test.ts

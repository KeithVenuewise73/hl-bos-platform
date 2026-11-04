#!/usr/bin/env bash
# The TransportationOS isolated database: every HL-BOS migration, the
# production fleet SQL recovered byte-for-byte, and the proposed SQL
# (P001 shared services, P002 the licence gate). Never touches Supabase.
#
#   bash scripts/local-test/tms-fleet-db.sh      # (re)creates database tms_fleet
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HLBOS_DB="${TMS_DB:-tms_fleet}" exec bash "$ROOT/scripts/local-test/isolated-db.sh" "$ROOT/supabase/recovered/production-2026-10-17"

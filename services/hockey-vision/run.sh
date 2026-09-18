#!/usr/bin/env bash
# Start the hockey vision service. Called by the Control Center; there is no
# reason for anyone to type this by hand.
set -euo pipefail
cd "$(dirname "$0")"
exec python3 -m hockey_vision.api

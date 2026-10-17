#!/usr/bin/env bash
# Perturbation sweep: every test model, its typed inputs moved one at a time and together, recalculated by the app's engine and by
# LibreOffice independently; any result that differs fails. Usage: tools/sweep/run.sh [out dir] [model…]
# Needs: node 22 with playwright (chromium), python3 with openpyxl, LibreOffice (soffice).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$HERE/../.." && pwd)"; OUT="${1:-$HERE/out}"; shift || true
mkdir -p "$OUT"
PORT="${SWEEP_PORT:-4096}"
python3 -m http.server "$PORT" -d "$APP" >/dev/null 2>&1 & S=$!; trap 'kill $S 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null "localhost:$PORT/" && break; sleep 0.5; done
node "$HERE/app.mjs" "http://localhost:$PORT/?mode=readonly" "$OUT" "$@" || exit 1
for j in "$OUT"/*.json; do case "$j" in *.lo.json) continue;; esac; python3 "$HERE/lo_ref.py" "$j" "${j%.json}.lo.json" || echo "{\"err\":\"LibreOffice failed\"}" > "${j%.json}.lo.json"; done
python3 "$HERE/cmp.py" "$OUT"

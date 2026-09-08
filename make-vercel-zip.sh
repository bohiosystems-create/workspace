#!/usr/bin/env bash
# Build a self-contained Vercel deployment zip for the Bohio Contractor Platform.
# Usage: ./make-vercel-zip.sh [output.zip]
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-bohio-vercel-$(date +%Y%m%d).zip}"
rm -f "$OUT"

# Files/folders that make up the deployable. deal-screener/, .git/, node_modules/
# and build scripts are intentionally excluded.
INCLUDE=(
  index.html
  contractor-portal.html
  whatsapp-demo.html
  worksite.js
  worksite-3d.js
  worksite.css
  Dallas-Light.woff2
  vercel.json
  .env.example
  VERCEL-README.txt
  api
  portal
  reports
)

zip -r -q "$OUT" "${INCLUDE[@]}"
echo "Built $OUT"
unzip -l "$OUT" | tail -n +2

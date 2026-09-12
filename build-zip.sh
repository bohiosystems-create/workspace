#!/usr/bin/env bash
# Build dist/bohio-vercel.zip from vercel-app/.
#
# The archive must be FLAT: index.html, vercel.json, package.json and api/
# sit at the archive root. If they end up one folder down, Vercel finds no
# index.html and every request answers 404: NOT_FOUND. The verification at
# the end of this script fails the build rather than shipping a nested zip.
set -euo pipefail
cd "$(dirname "$0")"

SRC=vercel-app
OUT=dist/bohio-vercel.zip

[ -f "$SRC/index.html" ] || { echo "missing $SRC/index.html"; exit 1; }
[ -f "$SRC/vercel.json" ] || { echo "missing $SRC/vercel.json"; exit 1; }

# vercel.json and package.json must parse, or the deployment fails on upload
node -e "JSON.parse(require('fs').readFileSync('$SRC/vercel.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('$SRC/package.json','utf8'))"

# every function must at least parse
for f in "$SRC"/api/*.js; do node --check "$f"; done

mkdir -p dist
rm -f "$OUT"
# zip from inside the source directory so nothing is prefixed with its name
( cd "$SRC" && zip -qr "../$OUT" . -x '.DS_Store' -x '__MACOSX/*' -x '*/.DS_Store' )

# Verify the archive is flat before anyone can deploy it. The listing is taken
# once into a variable: piping it into `grep -q` under `set -o pipefail` makes
# grep exit on its first match, SIGPIPE the unzip, and fail a healthy build.
LISTING=$(unzip -l "$OUT")
for want in 'index.html' 'vercel.json' 'package.json' 'api/whatsapp.js' 'api/health.js'; do
  grep -qE "[[:space:]]${want//./\\.}\$" <<<"$LISTING" \
    || { echo "FAIL: $want is not at the archive root"; exit 1; }
done

echo "built $OUT"
unzip -l "$OUT" | tail -3

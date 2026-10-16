#!/usr/bin/env bash
# Builds the three production folders in the bohio-demos checkout (no commit): each page split into a small page plus
# year-cached assets, the guide, the demo video, the serverless functions, the security headers.
# Usage: estatemaster-agent/tools/deploy.sh [path to the bohio-demos checkout]   (default: ../bohio-demos next to this repo, or $BOHIO_DEMOS)
# Then, in bohio-demos: git add kinan-estatemaster* && git commit && git push origin HEAD:main
set -e; T="$(cd "$(dirname "$0")" && pwd)"; W="$(cd "$T/../.." && pwd)"; D="${1:-${BOHIO_DEMOS:-$(cd "$W/.." && pwd)/bohio-demos}}"; [ -d "$D/.git" ] || { echo "bohio-demos checkout not found at $D"; exit 1; }
declare -A SRC=([kinan-estatemaster]=$W/estatemaster-agent/dist/option2-readonly/index.html [kinan-estatemaster-analyst]=$W/estatemaster-agent/dist/option3-analyst/index.html [kinan-estatemaster-api]=$W/estatemaster-agent-api/index.html)
declare -A GUIDE=([kinan-estatemaster]=readonly [kinan-estatemaster-analyst]=analyst [kinan-estatemaster-api]=api)
for d in kinan-estatemaster kinan-estatemaster-analyst kinan-estatemaster-api; do
  python3 $T/split_assets.py ${SRC[$d]} $D/$d
  for f in $D/$d/assets/*.js; do node --check $f || { echo "BAD $f"; exit 1; }; done
  cp $W/estatemaster-agent/guides/${GUIDE[$d]}.html $D/$d/guide.html
  cp $W/estatemaster-agent/demo/demo.webm $D/$d/demo.webm
  mkdir -p $D/$d/vendor && cp $W/estatemaster-agent/vendor/* $D/$d/vendor/   # the formula engine, Excel reader and PowerPoint library, served by the app itself
  for f in cron.js schedule.js voice.js llm.js mail.js scan.js _lib/emcheck.js _lib/graph.js _lib/sched.js; do
    [ -f $D/$d/api/$f ] && [ -f $W/estatemaster-agent/api/$f ] && cp $W/estatemaster-agent/api/$f $D/$d/api/$f; done
  cp $W/estatemaster-agent/api/log.js $W/estatemaster-agent/api/health.js $D/$d/api/
  cp $W/estatemaster-agent/api/_lib/mailui.js $W/estatemaster-agent/api/_lib/logo.js $D/$d/api/_lib/
  python3 $T/patch_vercel.py $D/$d/vercel.json >/dev/null
  grep -q "'/api/health'" $D/$d/middleware.js || sed -i "s#const OPEN = \['/api/cron'\];#const OPEN = ['/api/cron', '/api/health'];#" $D/$d/middleware.js
  for f in $D/$d/api/*.js $D/$d/api/_lib/*.js; do node --check $f || { echo "BAD $f"; exit 1; }; done
done
cd $D && git status --short

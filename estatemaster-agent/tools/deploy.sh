#!/usr/bin/env bash
# Builds the production folders in the bohio-demos checkout (no commit): the three KINAN apps and the Jadwa edition: each page split into a small page plus
# year-cached assets, the guide, the demo video, the serverless functions, the security headers.
# Usage: estatemaster-agent/tools/deploy.sh [path to the bohio-demos checkout]   (default: ../bohio-demos next to this repo, or $BOHIO_DEMOS)
# Then, in bohio-demos: git add kinan-estatemaster* jadwa && git commit && git push origin HEAD:main   (the Jadwa edition is served at jadwa.bohiotech.com)
set -e; T="$(cd "$(dirname "$0")" && pwd)"; W="$(cd "$T/../.." && pwd)"; D="${1:-${BOHIO_DEMOS:-$(cd "$W/.." && pwd)/bohio-demos}}"; [ -d "$D/.git" ] || { echo "bohio-demos checkout not found at $D"; exit 1; }
declare -A SRC=([kinan-estatemaster]=$W/estatemaster-agent/dist/option2-readonly/index.html [kinan-estatemaster-analyst]=$W/estatemaster-agent/dist/option3-analyst/index.html [kinan-estatemaster-api]=$W/estatemaster-agent-api/index.html [jadwa]=$W/estatemaster-agent/dist/jadwa-readonly/index.html)
declare -A GUIDE=([kinan-estatemaster]=$W/estatemaster-agent/guides/readonly.html [kinan-estatemaster-analyst]=$W/estatemaster-agent/guides/analyst.html [kinan-estatemaster-api]=$W/estatemaster-agent/guides/api.html [jadwa]=$W/estatemaster-agent/dist/jadwa-readonly/guide.html)
[ -f ${GUIDE[jadwa]} ] || python3 $T/build_options.py >/dev/null   # the Jadwa guide is built, not committed (a fresh worktree has none)
# the Excel add-in, per app: its own manifest (id, name, brand, host), the task pane and its icons
declare -A ADDIN=([kinan-estatemaster]="kinan|KINAN AI agent|KINAN|5f3d6a1e-9c2b-4e8a-b7d1-2a6c0e9f4b31" [jadwa]="jadwa|Jadwa AI agent|Jadwa|8b1e4c7a-3d5f-4a92-9e6b-71c0d2f8a5e4")
for d in kinan-estatemaster kinan-estatemaster-analyst kinan-estatemaster-api jadwa; do
  python3 $T/split_assets.py ${SRC[$d]} $D/$d
  for f in $D/$d/assets/*.js; do node --check $f || { echo "BAD $f"; exit 1; }; done
  cp ${GUIDE[$d]} $D/$d/guide.html
  cp $W/estatemaster-agent/demo/demo.webm $D/$d/demo.webm
  mkdir -p $D/$d/vendor && cp $W/estatemaster-agent/vendor/* $D/$d/vendor/   # the formula engine, Excel reader and PowerPoint library, served by the app itself
  for f in cron.js schedule.js voice.js llm.js mail.js scan.js _lib/emcheck.js _lib/graph.js _lib/sched.js; do
    [ -f $D/$d/api/$f ] && [ -f $W/estatemaster-agent/api/$f ] && cp $W/estatemaster-agent/api/$f $D/$d/api/$f; done
  cp $W/estatemaster-agent/api/log.js $W/estatemaster-agent/api/health.js $D/$d/api/
  if [ $d = jadwa ]; then cp $W/estatemaster-agent/dist/jadwa-readonly/api/_lib/mailui.js $W/estatemaster-agent/dist/jadwa-readonly/api/_lib/logo.js $D/$d/api/_lib/   # Jadwa's emails in its look
  else cp $W/estatemaster-agent/api/_lib/mailui.js $W/estatemaster-agent/api/_lib/logo.js $D/$d/api/_lib/; fi
  python3 $T/patch_vercel.py $D/$d/vercel.json >/dev/null
  if [ -n "${ADDIN[$d]}" ]; then IFS='|' read -r br nm sh id <<< "${ADDIN[$d]}"; rm -rf $D/$d/addin && mkdir -p $D/$d/addin/assets && cp $W/estatemaster-agent/addin/taskpane.html $D/$d/addin/ && cp $W/estatemaster-agent/addin/assets/*.png $D/$d/addin/assets/
    sed -e "s#__HOST__#$d.bohiotech.com#g" -e "s#__BRAND__#$br#g" -e "s#__NAME__#$nm#g" -e "s#__SHORT__#$sh#g" -e "s#__ID__#$id#g" $W/estatemaster-agent/addin/manifest.xml > $D/$d/addin/manifest.xml
    python3 -c "import xml.dom.minidom,sys;xml.dom.minidom.parse(sys.argv[1])" $D/$d/addin/manifest.xml || { echo "BAD manifest $d"; exit 1; }
    grep -q "addin/assets/" $D/$d/middleware.js || sed -i "s#(?!favicon.ico|icon.svg)#(?!favicon.ico|icon.svg|addin/assets/)#" $D/$d/middleware.js; fi   # Excel fetches the icons without the sign-in cookie
  grep -q "'/api/health'" $D/$d/middleware.js || sed -i "s#const OPEN = \['/api/cron'\];#const OPEN = ['/api/cron', '/api/health'];#" $D/$d/middleware.js
  for f in $D/$d/api/*.js $D/$d/api/_lib/*.js; do node --check $f || { echo "BAD $f"; exit 1; }; done
done
cd $D && git status --short

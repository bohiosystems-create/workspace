#!/usr/bin/env bash
# Runs the EstateMaster agent tests. Usage: tests/run.sh [quick|full|server]
#   core   — the server tests plus the answer-path browser set (about 10 minutes): before every push
#   quick  — the server tests plus a representative browser set (CI on every push; about 90 minutes locally)
#   full   — every test, on the read-only, analyst and mock-API builds (about 45 minutes)
#   server — the Node tests only, no browser
# Needs: node 22, `npm i playwright` (same version as the CI workflow) with chromium installed, python3.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; APP="$(dirname "$HERE")"; API="$(dirname "$APP")/estatemaster-agent-api"
MODE="${1:-quick}"; FAILS=0; LOG="${TEST_LOG:-$HERE/last-run.log}"; : > "$LOG"
sum(){ local out="$1"; local p; p=$(printf '%s\n' "$out" | grep -c '^PASS'); if printf '%s\n' "$out" | grep -q '^FAIL'; then echo "$p pass FAIL: $(printf '%s\n' "$out" | grep '^FAIL' | cut -c1-160 | tr '\n' ';')"; elif ! printf '%s\n' "$out" | grep -qE '^(PASS|FAIL)'; then if printf '%s\n' "$out" | grep -qiE 'NO ISSUES|0 with errors|0 layout/function issues'; then echo "clean"; else echo "CRASH: $(printf '%s\n' "$out" | grep -v '^\s*$' | tail -2 | tr '\n' ' ' | cut -c1-200)"; fi; else echo "$p pass"; fi; }
run(){ local name="$1"; shift; local out line; out=$(timeout 480 "$@" 2>&1); line="$name: $(sum "$out")"; case "$line" in *FAIL:*|*CRASH:*) FAILS=$((FAILS+1)); echo "$line" | tee -a "$LOG"; printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g' | grep -v '^[[:space:]]*at \|^[[:space:]]*$' | tail -12 | sed 's/^/    │ /';;
  *) echo "$line" | tee -a "$LOG";; esac; printf '== %s\n%s\n' "$name" "$out" >> "$LOG.full"; }

cd "$HERE"
echo "== server tests"
for t in t_*.cjs; do run "${t%.cjs}" node "$t"; done
[ "$MODE" = server ] && { echo "failures: $FAILS"; exit $((FAILS>0)); }

# static servers for the three builds
python3 -m http.server 4090 -d "$APP" >/dev/null 2>&1 & S1=$!
python3 -m http.server 4091 -d "$API" >/dev/null 2>&1 & S2=$!
trap 'kill $S1 $S2 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null localhost:4090/ && curl -s -o /dev/null localhost:4091/ && break; sleep 0.5; done
RO="http://localhost:4090/?mode=readonly"; AN="http://localhost:4090/?mode=analyst"; AP="http://localhost:4091/"

ANALYST="t_feed t_play t_voice t_deck t_narr t_tapvoice t_turn t_turn55 t_bvoice t_cues t_resume t_qwin t_lag t_lag2 t_stt t_btns"
API_ONLY="t_api"   # tests of the mock-API build only
API_SET="t_em t_feed t_xmodel t_dbgempty t_dbgwin t_roa t_check t_shell t_menu t_chat t_tools t_api t_bridge t_fix14 t_a11y t_report"
if [ "$MODE" = core ]; then
  # the pre-push tier (about 10 minutes): the answer path on uploaded workbooks, the newest rounds and the mock-API build; CI runs quick on the push, full nightly
  echo "== browser tests (core)"
  for t in t_smoke t_em t_xcalc t_accuracy t_speed t_projects t_xldl t_aifirst t_repupload t_round32 t_round33 t_round34; do run "$t readonly" node "$t.mjs" "$RO" readonly; done
  for t in t_em; do run "$t api" node "$t.mjs" "$AP" api; done
elif [ "$MODE" = quick ]; then
  echo "== browser tests (quick)"
  for t in t_em t_shell t_sens t_check t_dbgwin t_dbgempty t_roa t_cfapp t_genclar t_fix14 t_xmodel t_smoke t_a11y t_report t_hotelup t_talk t_syscheck t_chathist t_adr t_xcalc t_xcreview t_xcmodel2 t_xcread t_accuracy t_debugai t_nohurdle t_voicefail t_rdchat t_versions t_feas t_xldl t_drivers t_speed t_noest t_projects t_desk t_aifirst t_round11 t_repupload t_agents22 t_round22 t_round23 t_round24 t_round25 t_round26 t_round27 t_round28 t_aires t_aistrong t_round29 t_round30 t_round32 t_round33 t_round34; do run "$t readonly" node "$t.mjs" "$RO" readonly; done
  for t in t_feed t_play t_deck t_btns; do run "$t analyst" node "$t.mjs" "$AN" analyst; done
  for t in t_em t_api t_fix14 t_a11y; do run "$t api" node "$t.mjs" "$AP" api; done
else
  echo "== browser tests (full)"
  for f in t_*.mjs; do t="${f%.mjs}"; case " $API_ONLY " in *" $t "*) continue;; esac; case " $ANALYST " in *" $t "*) run "$t analyst" node "$f" "$AN" analyst;; *) run "$t readonly" node "$f" "$RO" readonly;; esac; done
  for t in $API_SET; do [ -f "$t.mjs" ] && run "$t api" node "$t.mjs" "$AP" api; done
fi
echo "failures: $FAILS" | tee -a "$LOG"
exit $((FAILS>0))

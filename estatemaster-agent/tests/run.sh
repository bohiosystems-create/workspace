#!/usr/bin/env bash
# Runs the EstateMaster agent tests. Usage: tests/run.sh [quick|full|server]
#   core   — the server tests plus the answer-path browser set (about 10 minutes): before every push
#   quick  — the server tests plus a representative browser set (CI on every push; about 90 minutes locally)
#   full   — every test, on the read-only, analyst and mock-API builds (about 45 minutes)
#   jadwa  — the answer-path set on the Jadwa edition (dist/jadwa-readonly), no server tests (CI: its own nightly job)
#   server — the Node tests only, no browser
# Needs: node 22, `npm i playwright` (same version as the CI workflow) with chromium installed, python3.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; APP="$(dirname "$HERE")"; API="$(dirname "$APP")/estatemaster-agent-api"
MODE="${1:-quick}"; FAILS=0; LOG="${TEST_LOG:-$HERE/last-run.log}"; : > "$LOG"
sum(){ local out="$1"; local p; p=$(printf '%s\n' "$out" | grep -c '^PASS'); if printf '%s\n' "$out" | grep -q '^FAIL'; then echo "$p pass FAIL: $(printf '%s\n' "$out" | grep '^FAIL' | cut -c1-160 | tr '\n' ';')"; elif ! printf '%s\n' "$out" | grep -qE '^(PASS|FAIL)'; then if printf '%s\n' "$out" | grep -qiE 'NO ISSUES|0 with errors|0 layout/function issues'; then echo "clean"; else echo "CRASH: $(printf '%s\n' "$out" | grep -v '^\s*$' | tail -2 | tr '\n' ' ' | cut -c1-200)"; fi; else echo "$p pass"; fi; }
run(){ local name="$1"; shift; local out line; out=$(timeout 480 "$@" 2>&1); line="$name: $(sum "$out")"; case "$line" in *FAIL:*|*CRASH:*) FAILS=$((FAILS+1)); echo "$line" | tee -a "$LOG"; printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g' | grep -v '^[[:space:]]*at \|^[[:space:]]*$' | tail -12 | sed 's/^/    │ /';;
  *) echo "$line" | tee -a "$LOG";; esac; printf '== %s\n%s\n' "$name" "$out" >> "$LOG.full"; }

cd "$HERE"
if [ "$MODE" != jadwa ]; then echo "== server tests"
for t in t_*.cjs; do run "${t%.cjs}" node "$t"; done; fi
[ "$MODE" = server ] && { echo "failures: $FAILS"; exit $((FAILS>0)); }

# static servers for the three builds
python3 -m http.server 4090 -d "$APP" >/dev/null 2>&1 & S1=$!
python3 -m http.server 4091 -d "$API" >/dev/null 2>&1 & S2=$!
trap 'kill $S1 $S2 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null localhost:4090/ && curl -s -o /dev/null localhost:4091/ && break; sleep 0.5; done
RO="http://localhost:4090/?mode=readonly"; AN="http://localhost:4090/?mode=analyst"; AP="http://localhost:4091/"

ANALYST="t_feed t_play t_voice t_deck t_narr t_tapvoice t_turn t_turn55 t_bvoice t_cues t_resume t_qwin t_lag t_lag2 t_stt t_btns"
API_ONLY="t_api"   # tests of the mock-API build only
JADWA_SET="t_accuracy t_smoke t_round34 t_round37 t_round38 t_docs t_fundlpa t_lpa_us t_arabic t_cfix t_xcalc t_round36 t_projects t_xldl t_round32 t_factsheet t_round33 t_round35 t_aifirst t_repupload"
API_SET="t_em t_feed t_xmodel t_dbgempty t_dbgwin t_roa t_check t_shell t_menu t_chat t_tools t_api t_bridge t_fix14 t_a11y t_report"
if [ "$MODE" = jadwa ]; then
  # the Jadwa edition (dist/jadwa-readonly: its own look and words) on the answer path, its documents and its report blocks; the tests that
  # check EstateMaster's own wording (t_em) or need the add-in folder (t_addin) run on the source only
  JD=$(mktemp -d); cp -r "$APP/dist/jadwa-readonly/." "$JD"; ln -s "$APP/vendor" "$JD/vendor"; ln -s "$HERE" "$JD/tests"
  python3 -m http.server 4093 -d "$JD" >/dev/null 2>&1 & S3=$!; trap 'kill $S1 $S2 $S3 2>/dev/null; rm -rf "$JD"' EXIT
  for i in $(seq 1 30); do curl -s -o /dev/null localhost:4093/ && break; sleep 0.5; done
  echo "== browser tests (Jadwa edition)"
  for t in $JADWA_SET; do run "$t jadwa" node "$t.mjs" "http://localhost:4093/?mode=readonly" readonly; done
elif [ "$MODE" = core ]; then
  # the pre-push tier (about 10 minutes): the answer path on uploaded workbooks, the newest rounds and the mock-API build; CI runs quick on the push, full nightly.
  # Three lanes run side by side (each test has its own browser), balanced by their CI times; t_speed runs alone after them, as it measures timings.
  echo "== browser tests (core)"
  lane(){ local f="$1"; shift; for t in "$@"; do if [ "$t" = t_em_api ]; then run "t_em api" node t_em.mjs "$AP" api; else run "$t readonly" node "$t.mjs" "$RO" readonly; fi; done > "$f" 2>&1; }
  LD=$(mktemp -d)
  lane "$LD/a" t_accuracy t_smoke t_round34 t_round37 t_round38 t_docs t_audit2 & L1=$!
  lane "$LD/b" t_xcalc t_round36 t_projects t_xldl t_round32 t_factsheet t_engine t_arabic & L2=$!
  lane "$LD/c" t_round33 t_round35 t_aifirst t_repupload t_em t_em_api t_addin t_cfix & L3=$!
  wait $L1 $L2 $L3   # the lanes only: a bare wait would also wait on the static servers
  cat "$LD/a" "$LD/b" "$LD/c"; FAILS=$((FAILS+$(cat "$LD/a" "$LD/b" "$LD/c" | grep -cE '^t_[a-z0-9_]+ (readonly|api): .*(FAIL:|CRASH:)'))); rm -rf "$LD"
  run "t_speed readonly" node t_speed.mjs "$RO" readonly
elif [ "$MODE" = quick ]; then
  echo "== browser tests (quick)"
  for t in t_em t_shell t_sens t_check t_dbgwin t_dbgempty t_roa t_cfapp t_genclar t_fix14 t_xmodel t_smoke t_a11y t_report t_hotelup t_talk t_syscheck t_chathist t_adr t_xcalc t_xcreview t_xcmodel2 t_xcread t_accuracy t_debugai t_nohurdle t_voicefail t_rdchat t_versions t_feas t_xldl t_drivers t_speed t_noest t_projects t_desk t_aifirst t_round11 t_repupload t_agents22 t_round22 t_round23 t_round24 t_round25 t_round26 t_round27 t_round28 t_aires t_aistrong t_round29 t_round30 t_round32 t_round33 t_round34 t_round35 t_round36 t_round37 t_round38 t_sens2 t_factsheet t_docs t_fundlpa t_lpa_us t_arabic t_cfix t_addin; do run "$t readonly" node "$t.mjs" "$RO" readonly; done
  for t in t_feed t_play t_deck t_btns; do run "$t analyst" node "$t.mjs" "$AN" analyst; done
  for t in t_em t_api t_fix14 t_a11y; do run "$t api" node "$t.mjs" "$AP" api; done
else
  echo "== browser tests (full)"
  for f in t_*.mjs; do t="${f%.mjs}"; [ "$t" = t_liveai ] && continue;   # the live-AI evaluation has its own workflow (it needs the key)
  case " $API_ONLY " in *" $t "*) continue;; esac; case " $ANALYST " in *" $t "*) run "$t analyst" node "$f" "$AN" analyst;; *) run "$t readonly" node "$f" "$RO" readonly;; esac; done
  for t in $API_SET; do [ -f "$t.mjs" ] && run "$t api" node "$t.mjs" "$AP" api; done
fi
echo "failures: $FAILS" | tee -a "$LOG"
exit $((FAILS>0))

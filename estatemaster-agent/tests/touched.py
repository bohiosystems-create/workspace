#!/usr/bin/env python3
"""The tests a change reaches. `touched.py [BASE]` prints the browser tests whose recorded run (coverage_map.json) executed a function
this change edits in index.html, against BASE (default: the branch's upstream; uncommitted edits included). `touched.py --build DIR`
folds the per-test files a COV_OUT run wrote (cov_preload.mjs) into coverage_map.json. A function no test runs is printed to stderr:
nothing covers it, so a new test must."""
import json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.dirname(HERE); MAP = os.path.join(HERE, 'coverage_map.json')
if len(sys.argv) > 2 and sys.argv[1] == '--build':
    d = sys.argv[2]; tests = sorted(f[:-5] for f in os.listdir(d) if f.endswith('.json')); fns = {}
    for i, t in enumerate(tests):
        for fn in json.load(open(os.path.join(d, t + '.json'))): fns.setdefault(fn, []).append(i)
    json.dump({'tests': tests, 'fns': fns}, open(MAP, 'w'), separators=(',', ':')); print(f'{len(tests)} tests, {len(fns)} functions'); sys.exit(0)
base = sys.argv[1] if len(sys.argv) > 1 else '@{u}'
def git(*a):
    r = subprocess.run(['git', '-C', APP, *a], capture_output=True, text=True); return r.stdout if r.returncode == 0 else ''
diff = git('diff', '-U0', base, '--', 'index.html') or git('diff', '-U0', 'HEAD~1', '--', 'index.html')
lines = set()
for m in re.finditer(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@', diff, re.M):
    a, n = int(m.group(1)), int(m.group(2) or 1); lines.update(range(a, a + max(n, 1)))
src = open(os.path.join(APP, 'index.html'), encoding='utf8').read().split('\n')
decl = re.compile(r'^(?:async\s+)?function\s+([\w$]+)\s*\(|^(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\(|[\w$]+\s*=>|function)')
changed = set()
for ln in sorted(lines):
    for i in range(min(ln, len(src)) - 1, -1, -1):
        m = decl.match(src[i])
        if m: changed.add(m.group(1) or m.group(2)); break
mp = json.load(open(MAP)) if os.path.exists(MAP) else {'tests': [], 'fns': {}}
sel = set(); none = []
for fn in sorted(changed):
    ix = mp['fns'].get(fn)
    if ix: sel.update(mp['tests'][i] for i in ix)
    else: none.append(fn)
if none: print('no recorded test runs: ' + ', '.join(none), file=sys.stderr)
print('\n'.join(sorted(sel)))

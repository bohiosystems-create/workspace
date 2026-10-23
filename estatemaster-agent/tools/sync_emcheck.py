#!/usr/bin/env python3
"""Copies emChecks() and parseInputs() from api/_lib/emcheck.js into index.html, so the app and the server run the
same checks. Run after editing api/_lib/emcheck.js (build_options.py runs it too)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'api/_lib/emcheck.js').read_text()
html_p = root / 'index.html'; html = html_p.read_text()
block = src[src.index('/*EMCHECKS-START*/'):src.index('/*EMCHECKS-END*/') + len('/*EMCHECKS-END*/')]
m = re.search(r"function parseInputs\(sheets\) \{.*?\n\}\n", src, re.S)
inputs = m.group(0)
new = '/*EMCHECK-SYNC-START*/\n/* GENERATED from api/_lib/emcheck.js by tools/sync_emcheck.py (run by build_options.py): edit the reader THERE.\n   Anything edited between these markers in index.html is overwritten by the next build. */\n' + "const ROWS=[['levered_irr','Levered IRR','%'],['unlevered_irr','Unlevered IRR','%'],['profit_on_cost','Profit on cost','%'],['net_profit','Net profit','M'],['total_cost','Total development cost','M'],['gross_revenue','Gross revenue','M'],['equity_multiple','Equity multiple','x'],['peak_debt','Peak debt','M']];\nconst LAB=EXLAB;\nconst numOf=v0=>{if(typeof v0==='number')return v0;const v=typeof v0==='string'?v0.replace(/[٠-٩]/g,d=>d.charCodeAt(0)-0x660).replace(/[۰-۹]/g,d=>d.charCodeAt(0)-0x6F0).replace(/٬/g,',').replace(/٫/g,'.').replace(/٪/g,'%'):v0;return typeof v==='string'&&/^\\s*-?[\\d,.]+\\s*%?\\s*$/.test(v)&&v.trim()?parseFloat(v.replace(/[,%\\s]/g,'')):null};\n" + inputs + block + '\n/*EMCHECK-SYNC-END*/'
if '/*EMCHECK-SYNC-START*/' in html:
    html = html[:html.index('/*EMCHECK-SYNC-START*/')] + new + html[html.index('/*EMCHECK-SYNC-END*/') + len('/*EMCHECK-SYNC-END*/'):]
else:
    anchor = '/* Which stored Option / Stage the export is:'
    assert anchor in html
    html = html.replace(anchor, new + '\n' + anchor, 1)
# the output patterns too: the app's EXLAB is the server's LAB, word for word (they had drifted apart once)
lab = re.search(r'const LAB = (\[.*?\]\]);', src).group(1)
i = html.index('const EXLAB='); j = html.index('\n', i); html = html[:i] + 'const EXLAB=' + lab + ';' + html[j:]
html_p.write_text(html)
print('emcheck synced into index.html')

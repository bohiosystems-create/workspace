#!/usr/bin/env python3
"""Copies the email design kit (api/_lib/mailui.js and the logo in api/_lib/logo.js) into index.html as MAILUI, so the
emails the app sends look exactly like the server's. Run after editing either file (build_options.py runs it too)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'api/_lib/mailui.js').read_text(encoding='utf-8')
logo = (root / 'api/_lib/logo.js').read_text(encoding='utf-8')
lit = re.search(r"module\.exports = (\{[\s\S]*?\});", logo).group(1)
src = src.replace("const LOGO = require('./logo');", f"const LOGO = {lit};")
exp = re.search(r"module\.exports = (\{[^}]*\});", src)
body = src[:exp.start()] + f"return {exp.group(1)};"
new = '/*MAILUI-SYNC-START*/\nconst MAILUI=(()=>{\n' + body + '\n})();\n/*MAILUI-SYNC-END*/'
html_p = root / 'index.html'; html = html_p.read_text(encoding='utf-8')
if '/*MAILUI-SYNC-START*/' in html:
    html = html[:html.index('/*MAILUI-SYNC-START*/')] + new + html[html.index('/*MAILUI-SYNC-END*/') + len('/*MAILUI-SYNC-END*/'):]
else:
    anchor = '/* the same KINAN email frame the server uses'
    assert anchor in html
    html = html.replace(anchor, new + '\n' + anchor, 1)
html_p.write_text(html, encoding='utf-8')
print('mailui synced into index.html')

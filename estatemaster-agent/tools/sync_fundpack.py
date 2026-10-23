#!/usr/bin/env python3
"""Builds the Gulf real estate fund knowledge pack (fundpack/data: bilingual Saudi and UAE terms, the Umm al-Qura calendar, Hijri and
Gregorian month names, Saudi CMA limits and the UAE onshore, DIFC and ADGM limits, model rules, tax defaults, the signals of each
regime, Arabic text-quality markers) into a compact block in index.html, so the app reads
contracts with it in the browser. Run after editing fundpack/data (build_options.py runs it too)."""
import csv, json, pathlib, yaml
root = pathlib.Path(__file__).resolve().parent.parent
D = root / 'fundpack/data'
terms = yaml.safe_load((D / 'terms.yaml').read_text(encoding='utf-8'))
cal = yaml.safe_load((D / 'calendar.yaml').read_text(encoding='utf-8'))
cma = yaml.safe_load((D / 'cma_rules.yaml').read_text(encoding='utf-8'))
tq = yaml.safe_load((D / 'text_quality.yaml').read_text(encoding='utf-8'))
rows = list(csv.DictReader((D / 'ummalqura_months.csv').open(encoding='utf-8')))
# the calendar as month lengths from its first month: 1 = 30 days, 0 = 29 days
first = rows[0]
lens = ''.join('1' if r['length_days'] == '30' else '0' for r in rows)
assert all(r['length_days'] in ('29', '30') for r in rows)
uae_terms = yaml.safe_load((D / 'terms_uae.yaml').read_text(encoding='utf-8'))
uae = yaml.safe_load((D / 'uae_rules.yaml').read_text(encoding='utf-8'))
juris = yaml.safe_load((D / 'jurisdictions.yaml').read_text(encoding='utf-8'))['jurisdictions']
T = [[t['id'], t['category'], t['en'], t['ar'], t.get('en_syn') or [], t.get('ar_syn') or [], t.get('verified', ''), t.get('schema_path', ''), 'KSA'] for t in terms['terms']]
T += [[t['id'], t['category'], t['en'], t['ar'], t.get('en_syn') or [], t.get('ar_syn') or [], t.get('verified', ''), t.get('schema_path', ''), t.get('jurisdiction', 'UAE')] for t in uae_terms['terms']]
H = [[m['number'], m['ar'], m['en'], (m.get('ar_variants') or []) + (m.get('en_variants') or [])] for m in cal['hijri_months']]
G = [[m['number'], m['ar'], m['en'], m.get('ar_variants') or []] for m in cal['gregorian_months']]
keep = ('id', 'field', 'op', 'limit', 'unit', 'applies_to', 'severity', 'en', 'ar', 'source')
C = [{k: c[k] for k in keep if k in c} for c in cma['checks']]
keepU = keep + ('jurisdiction', 'basis', 'when', 'unless', 'confidence')
U = [{k: c[k] for k in keepU if k in c} for c in uae['checks']]
FP = {'version': terms.get('version'), 'regulation': cma.get('regulation_version'), 'terms': T, 'hijri': H, 'greg': G,
      'uq': {'y0': int(first['hijri_year']), 'm0': int(first['hijri_month']), 'start': first['gregorian_start'], 'len': lens},
      'cma': C, 'rules': cma.get('model_rules', []), 'tax': cma.get('tax_defaults', {}), 'quality': tq,
      'conventions': [{'id': c['id'], 'en': ' '.join(str(c['en']).split())} for c in cal.get('conventions', [])],
      'uae': U, 'uaeRules': [{'id': r['id'], 'jurisdiction': r.get('jurisdiction', []), 'en': ' '.join(str(r['en']).split())} for r in uae.get('model_rules', [])],
      'uaeTax': [{'id': t['id'], 'value': t.get('value'), 'en': ' '.join(str(t['en']).split())} for t in (uae.get('tax_defaults') or {}).get('items', [])],
      'uaeRegulation': uae.get('regulation_version'), 'juris': {k: {'name': v['name'], 'strong': v['strong'], 'weak': v['weak']} for k, v in juris.items()}}
block = ('/*FUNDPACK-START*/\n/* GENERATED from fundpack/data (the Saudi real estate fund knowledge pack) by tools/sync_fundpack.py: edit the data THERE.\n'
         '   Anything edited between these markers in index.html is overwritten by the next build. */\n'
         'const FP=' + json.dumps(FP, ensure_ascii=False, separators=(',', ':')) + ';\n/*FUNDPACK-END*/')
p = root / 'index.html'; html = p.read_text(encoding='utf-8')
if '/*FUNDPACK-START*/' in html:
    html = html[:html.index('/*FUNDPACK-START*/')] + block + html[html.index('/*FUNDPACK-END*/') + len('/*FUNDPACK-END*/'):]
else:
    anchor = '/* how the agent writes Arabic: the same figures, said the way a Saudi investment team says them */'
    assert html.count(anchor) == 1
    html = html.replace(anchor, block + '\n' + anchor)
p.write_text(html, encoding='utf-8')
print(f'fundpack synced into index.html: {len(T)} terms, {len(rows)} Umm al-Qura months, {len(C)} Saudi and {len(U)} UAE checks, {len(block)//1024} KB')

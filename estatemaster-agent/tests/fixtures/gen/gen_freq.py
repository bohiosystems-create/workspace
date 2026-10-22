"""Synthetic lease-expiry model using FREQUENCY (which the browser engine does not have): the share of rent expiring in each window,
saved as Excel saves it (each result stored). Run: python3 gen_freq.py <out.xlsx>"""
import sys, re, zipfile, tempfile, os
from openpyxl import Workbook
OUT = sys.argv[1]
exp = [2027, 2028, 2028, 2030, 2031, 2026, 2033, 2029, 2027, 2032]
rent = [1200, 800, 650, 2100, 900, 400, 1500, 700, 1100, 950]
bins = [2027, 2029, 2031]
wb = Workbook(); ws = wb.active; ws.title = 'Leases'
ws.append(['Tenant', 'Expiry', 'Rent'])
for i, (e, r) in enumerate(zip(exp, rent)):
    ws.append([f'T{i + 1}', e, r])
ws['E1'], ws['E2'], ws['E3'], ws['E4'] = 'Window ends', 2027, 2029, 2031
ws['F1'] = 'Leases expiring'
for k in range(4):
    ws.cell(2 + k, 6, f'=INDEX(FREQUENCY($B$2:$B$11,$E$2:$E$4),{k + 1})')
ws['H1'], ws['H2'] = 'Rent growth', 0.03
ws['H4'], ws['I4'] = 'Leases expiring by 2027', '=F2'
ws['H5'], ws['I5'] = 'Share of leases expiring by 2029', '=(F2+F3)/COUNT(B2:B11)'
ws['H6'], ws['I6'] = 'Rent in year 5', '=SUM(C2:C11)*(1+H2)^5'
def freq(xs, bs):
    out, lo = [], None
    for b in bs:
        out.append(sum(1 for x in xs if (lo is None or x > lo) and x <= b)); lo = b
    out.append(sum(1 for x in xs if x > bs[-1])); return out
fr = freq(exp, bins)
vals = {f'F{2 + k}': fr[k] for k in range(4)}
vals.update({'I4': fr[0], 'I5': (fr[0] + fr[1]) / len(exp), 'I6': sum(rent) * 1.03 ** 5})
tmp = tempfile.mktemp(suffix='.xlsx'); wb.save(tmp)
zin = zipfile.ZipFile(tmp); zout = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    data = zin.read(it.filename)
    if it.filename == 'xl/worksheets/sheet1.xml':
        x = data.decode()
        for ref, v in vals.items():
            x = re.sub(r'(<c r="%s"[^>]*>)(<f>[^<]*</f>)(?:<v>[^<]*</v>|<v\s*/>)?' % ref, lambda m: m.group(1) + m.group(2) + '<v>%r</v>' % v, x, 1)
        data = x.encode()
    zout.writestr(it, data)
zout.close(); os.remove(tmp); print('written', OUT, fr)

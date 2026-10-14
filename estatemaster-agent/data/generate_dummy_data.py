"""Generate the DUMMY market dataset used by the EstateMaster agent demo.

All records are synthetic. Nothing here is a real transaction, lease, plot,
regulation or email. Run from this folder:  python generate_dummy_data.py
Writes data.json (embedded into ../index.html) and ../market-data.xlsx.
"""
import json, random, datetime as dt
from pathlib import Path

random.seed(7)
AS_OF = dt.date(2026, 9, 29)
START = dt.date(2024, 10, 1)
DAYS = (dt.date(2026, 9, 20) - START).days

# district: (ring, resi SAR/sqm at as-of, retail rent SAR/sqm/yr, resi rent SAR/sqm/yr)
DIST = {
    'Al Narjis': (1, 12600, 2400, 610),
    'Al Yasmin': (2, 12300, 2420, 600),
    'Al Arid':   (2, 11700, 2050, 540),
    'Al Malqa':  (2, 13300, 2650, 660),
    'Hittin':    (3, 14300, 2800, 720),
    'Al Sahafa': (3, 12000, 2050, 570),
}
DW = {'Al Narjis': 5, 'Al Yasmin': 3, 'Al Arid': 2.5, 'Al Malqa': 2.5, 'Hittin': 2, 'Al Sahafa': 2}
TYPES = [('Apartment', 1.00, (95, 190), 7), ('Townhouse', 1.04, (200, 300), 2), ('Duplex', 1.02, (170, 260), 1.5)]

def pick(weights):
    k = list(weights); return random.choices(k, [weights[x] for x in k])[0]

def rdate():
    return START + dt.timedelta(days=random.randint(0, DAYS))

def months_ago(d):
    return (AS_OF - d).days / 30.44

tx = []
for i in range(160):
    d = rdate(); dist = pick(DW); ring, base, *_ = DIST[dist]
    t = random.choices(TYPES, [x[3] for x in TYPES])[0]
    size = random.randint(*t[2])
    ppsqm = base * t[1] * (1 - 0.04 * months_ago(d) / 12) * random.lognormvariate(0, 0.045)
    price = round(size * ppsqm / 1000) * 1000
    tx.append({'id': f'TX-{24000 + i}', 'date': d.isoformat(), 'district': dist, 'ring': ring, 'type': t[0],
               'size': size, 'price': price, 'status': random.choice(['Ready', 'Ready', 'Off-plan']),
               'floor': random.randint(0, 9) if t[0] == 'Apartment' else 0})
tx.sort(key=lambda r: r['date'], reverse=True)

rent = []
for i in range(110):
    d = rdate(); dist = pick(DW); ring, _, retail, resi = DIST[dist]
    use = 'Retail' if random.random() < 0.7 else 'Residential'
    size = random.randint(80, 320) if use == 'Retail' else random.randint(90, 200)
    front = random.choice(['Main road', 'Main road', 'Internal']) if use == 'Retail' else '-'
    b = (retail * (1.0 if front == 'Main road' else 0.92)) if use == 'Retail' else resi
    r = b * (1 - 0.03 * months_ago(d) / 12) * random.lognormvariate(0, 0.06)
    rent.append({'id': f'LS-{51000 + i}', 'date': d.isoformat(), 'district': dist, 'ring': ring, 'use': use,
                 'size': size, 'annual': round(size * r / 100) * 100, 'term': random.choice([1, 3, 3, 5, 5, 10]) if use == 'Retail' else 1,
                 'frontage': front})
rent.sort(key=lambda r: r['date'], reverse=True)

zones = [
    {'code': 'C-MU1', 'name': 'Mixed-use, commercial corridor', 'far': 3.0, 'cov': 0.60, 'front': 6, 'side': 3, 'rear': 3, 'floors': 12, 'park_unit': 1.5, 'park_retail': 50, 'uses': 'Residential, retail, office'},
    {'code': 'C-MU2', 'name': 'Mixed-use, high density', 'far': 4.5, 'cov': 0.55, 'front': 8, 'side': 4, 'rear': 4, 'floors': 20, 'park_unit': 1.5, 'park_retail': 45, 'uses': 'Residential, retail, office, hotel'},
    {'code': 'C-2', 'name': 'Commercial', 'far': 2.4, 'cov': 0.65, 'front': 6, 'side': 2, 'rear': 3, 'floors': 8, 'park_unit': 1.0, 'park_retail': 40, 'uses': 'Retail, office'},
    {'code': 'R-3', 'name': 'Residential, medium density', 'far': 1.8, 'cov': 0.60, 'front': 5, 'side': 2, 'rear': 2, 'floors': 4, 'park_unit': 1.5, 'park_retail': 0, 'uses': 'Residential'},
    {'code': 'R-2', 'name': 'Residential, villas', 'far': 1.2, 'cov': 0.60, 'front': 4, 'side': 2, 'rear': 2, 'floors': 3, 'park_unit': 2.0, 'park_retail': 0, 'uses': 'Residential'},
]
plots = [
    {'id': 'NRJ-0417', 'district': 'Al Narjis', 'zone': 'C-MU1', 'area': 20000, 'w': 200, 'd': 100, 'street': 40, 'note': 'Subject site (Al Narjis Mixed-Use)'},
    {'id': 'NRJ-0422', 'district': 'Al Narjis', 'zone': 'C-MU1', 'area': 12500, 'w': 125, 'd': 100, 'street': 40, 'note': ''},
    {'id': 'NRJ-0510', 'district': 'Al Narjis', 'zone': 'R-3', 'area': 3600, 'w': 60, 'd': 60, 'street': 20, 'note': ''},
    {'id': 'NRJ-0588', 'district': 'Al Narjis', 'zone': 'R-2', 'area': 900, 'w': 30, 'd': 30, 'street': 15, 'note': ''},
    {'id': 'YSM-0231', 'district': 'Al Yasmin', 'zone': 'C-2', 'area': 8000, 'w': 100, 'd': 80, 'street': 30, 'note': ''},
    {'id': 'MLQ-0109', 'district': 'Al Malqa', 'zone': 'C-MU2', 'area': 24000, 'w': 200, 'd': 120, 'street': 60, 'note': ''},
    {'id': 'ARD-0340', 'district': 'Al Arid', 'zone': 'R-3', 'area': 4800, 'w': 80, 'd': 60, 'street': 20, 'note': ''},
    {'id': 'HTN-0077', 'district': 'Hittin', 'zone': 'C-MU2', 'area': 16000, 'w': 160, 'd': 100, 'street': 40, 'note': ''},
]

# Dummy Outlook messages. 'change' is what the agent extracts: var, delta (same units as the demo sandbox), confidence.
emails = [
    {'id': 'em1', 'date': '2026-09-27 08:14', 'from': 'Omar H. · Project Manager', 'addr': 'omar.h@kinan.example', 'subject': 'Programme update: approvals slipping',
     'body': 'Municipality comments on the building permit came back on Thursday. Resubmission plus review adds roughly 3 months. Construction start moves from Jan to Apr 2027. Handover follows.',
     'change': {'var': 'delay', 'delta': 3, 'conf': 0.9, 'quote': 'adds roughly 3 months'}},
    {'id': 'em2', 'date': '2026-09-25 16:02', 'from': 'Layla S. · Debt Advisory, Gulf Bank (dummy)', 'addr': 'l.s@bank.example', 'subject': 'Indicative term sheet: Al Narjis construction facility',
     'body': 'Please find the indicative terms: 50% loan-to-cost, pricing SAIBOR + 250 bps, which today is c. 9.0% all-in. Subject to credit approval.',
     'change': {'var': 'rate', 'delta': 0.5, 'conf': 0.85, 'quote': 'c. 9.0% all-in', 'also': {'var': 'ltc', 'delta': -5, 'quote': '50% loan-to-cost'}}},
    {'id': 'em3', 'date': '2026-09-22 11:40', 'from': 'Sara K. · Cost Consultant (QS)', 'addr': 'sara.k@qs.example', 'subject': 'Tender returns: podium and tower',
     'body': 'Three tenders received. The lowest compliant bid is 8% above the cost plan, driven by steel and MEP. We recommend carrying SAR 5,620/sqm GFA in the feasibility.',
     'change': {'var': 'cost', 'delta': 8, 'conf': 0.95, 'quote': 'carrying SAR 5,620/sqm'}},
    {'id': 'em4', 'date': '2026-09-18 09:05', 'from': 'Faisal A. · Sales Director', 'addr': 'faisal.a@kinan.example', 'subject': 'Off-plan launch pricing',
     'body': 'Two competing launches in Al Narjis opened at 12,600 to 12,900 SAR/sqm. I suggest we launch at 12,800 and hold the premium for the top floors.',
     'change': {'var': 'price', 'delta': -5.2, 'conf': 0.8, 'quote': 'launch at 12,800'}},
    {'id': 'em5', 'date': '2026-09-15 14:30', 'from': 'Dana M. · Planning Consultant', 'addr': 'dana.m@planning.example', 'subject': 'Pre-application feedback, plot NRJ-0417',
     'body': 'The authority confirmed FAR 3.0 with no bonus for the public plaza. The scheme must come down to 60,000 sqm GFA. Setbacks and height are fine.',
     'change': {'var': 'area', 'delta': -3.3, 'conf': 0.9, 'quote': 'come down to 60,000 sqm GFA'}},
    {'id': 'em6', 'date': '2026-09-10 17:20', 'from': 'Khalid R. · Leasing Agent', 'addr': 'khalid.r@leasing.example', 'subject': 'Anchor LOI for the podium',
     'body': 'Supermarket anchor has signed an LOI for 2,400 sqm at SAR 2,300/sqm/yr, 10-year term. Line shops should follow at similar levels.',
     'change': {'var': 'rent', 'delta': -4.2, 'conf': 0.75, 'quote': 'SAR 2,300/sqm/yr'}},
    {'id': 'em7', 'date': '2026-09-09 10:00', 'from': 'HR · KINAN', 'addr': 'hr@kinan.example', 'subject': 'Team offsite logistics',
     'body': 'Buses leave at 7:30 from the head office. Please confirm dietary requirements by Sunday.', 'change': None},
]

Path(__file__).with_name('data.json').write_text(json.dumps(
    {'asOf': AS_OF.isoformat(), 'tx': tx, 'rent': rent, 'zones': zones, 'plots': plots, 'emails': emails}, separators=(',', ':')))

# ---------------- Excel ----------------
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment

F = 'Arial'
NAVY = '000919'
H = Font(name=F, bold=True, color='FFFFFF', size=10)
HF = PatternFill('solid', fgColor=NAVY)
B = Font(name=F, size=10); BB = Font(name=F, size=10, bold=True)
BLUE = Font(name=F, size=10, color='0000FF'); GREEN = Font(name=F, size=10, color='008000')
YEL = PatternFill('solid', fgColor='FFFF00')
T = Font(name=F, size=16, bold=True, color=NAVY)
RED = Font(name=F, size=10, bold=True, color='C00000')
thin = Border(bottom=Side(style='thin', color='D9D9D9'))

wb = Workbook()

def header(ws, row, cols, widths=None):
    for j, c in enumerate(cols, 1):
        x = ws.cell(row=row, column=j, value=c); x.font = H; x.fill = HF; x.alignment = Alignment(vertical='center', wrap_text=True)
    ws.row_dimensions[row].height = 30
    if widths:
        for j, w in enumerate(widths, 1): ws.column_dimensions[chr(64 + j) if j <= 26 else 'A' + chr(64 + j - 26)].width = w
    ws.freeze_panes = ws.cell(row=row + 1, column=1)

def banner(ws, title, sub):
    ws['A1'] = title; ws['A1'].font = T
    ws['A2'] = sub; ws['A2'].font = RED

# README
ws = wb.active; ws.title = 'README'
banner(ws, 'Al Narjis market data (DUMMY)', 'Synthetic data for the Bohio agent demo. Not real transactions, leases, plots, regulations or emails.')
rows = [
    ('Sheet', 'Contents'),
    ('Benchmarks', 'Comparable-sales and retail-rent percentiles for the chosen scope and period, and where the model sits. Edit the blue cells.'),
    ('Regulation check', 'Checks a scheme against the zoning rules of a plot (FAR, coverage, setbacks, height, parking). Edit the blue cells.'),
    ('Transactions', f'{len(tx)} dummy residential sales, {START:%b %Y} to {AS_OF:%b %Y}. Price/sqm and scope columns are formulas.'),
    ('Rentals', f'{len(rent)} dummy leases (retail and residential). Rent/sqm and scope columns are formulas.'),
    ('Zoning rules', 'Dummy zoning classes with FAR, coverage, setbacks, height and parking ratios.'),
    ('Plots', 'Dummy plots and their zoning class. NRJ-0417 is the demo site.'),
    ('Outlook emails', 'Dummy emails the agent reads for context on assumption changes, with the change it extracts.'),
    ('', ''),
    ('Legend', ''),
    ('Blue text', 'Input you can change'),
    ('Black text', 'Formula'),
    ('Green text', 'Formula pulling from another sheet'),
    ('Yellow fill', 'Key input'),
    ('', ''),
    ('Districts / scope rings', '1 = Al Narjis · 2 = adjacent (Al Yasmin, Al Arid, Al Malqa) · 3 = wider north Riyadh (Hittin, Al Sahafa)'),
    ('As-of date', AS_OF.isoformat()),
    ('Generator', 'data/generate_dummy_data.py (seeded, reproducible)'),
]
for i, (a, b) in enumerate(rows, 4):
    ws.cell(row=i, column=1, value=a).font = BB if i == 4 or a == 'Legend' else B
    ws.cell(row=i, column=2, value=b).font = BB if i == 4 else B
ws['A14'].font = BLUE; ws['A16'].font = GREEN; ws['A17'].fill = YEL
ws.column_dimensions['A'].width = 24; ws.column_dimensions['B'].width = 110

# Benchmarks inputs live on Benchmarks!C5:C8 ; referenced from data sheets
BM = "Benchmarks"
NT, NR = len(tx), len(rent)

# Transactions
ws = wb.create_sheet('Transactions')
banner(ws, 'Residential sales (DUMMY)', 'Synthetic records. Columns H, J, K are formulas.')
cols = ['Record ID', 'Date', 'District', 'Scope ring', 'Property type', 'Status', 'Unit size (sqm)', 'Price (SAR)', 'Floor', 'Price (SAR/sqm)', 'Months before as-of', 'In comp set', 'Comp value (SAR/sqm)']
# reorder: keep price as input, derive per sqm
cols = ['Record ID', 'Date', 'District', 'Scope ring', 'Property type', 'Status', 'Floor', 'Unit size (sqm)', 'Price (SAR)', 'Price (SAR/sqm)', 'Months before as-of', 'In comp set', 'Comp value (SAR/sqm)']
header(ws, 4, cols, [12, 12, 13, 10, 13, 10, 7, 12, 14, 13, 12, 11, 14])
for i, r in enumerate(tx, 5):
    vals = [r['id'], dt.date.fromisoformat(r['date']), r['district'], r['ring'], r['type'], r['status'], r['floor'], r['size'], r['price']]
    for j, v in enumerate(vals, 1):
        c = ws.cell(row=i, column=j, value=v); c.font = BLUE; c.border = thin
    ws.cell(row=i, column=2).number_format = 'yyyy-mm-dd'
    ws.cell(row=i, column=9).number_format = '#,##0'
    ws.cell(row=i, column=10, value=f'=IF(H{i}>0,I{i}/H{i},0)').number_format = '#,##0'
    ws.cell(row=i, column=11, value=f"=({BM}!$C$6-B{i})/30.44").number_format = '0.0'
    ws.cell(row=i, column=12, value=f"=IF(AND(D{i}<={BM}!$C$9,K{i}<={BM}!$C$7,OR({BM}!$C$8=\"All\",{BM}!$C$8=E{i})),1,0)")
    ws.cell(row=i, column=13, value=f'=IF(L{i}=1,J{i},"")').number_format = '#,##0'
    for j in (10, 11, 12, 13): ws.cell(row=i, column=j).font = B; ws.cell(row=i, column=j).border = thin
ws.auto_filter.ref = f'A4:M{NT + 4}'
TX_COMP = f'Transactions!$M$5:$M${NT + 4}'

# Rentals
ws = wb.create_sheet('Rentals')
banner(ws, 'Leases (DUMMY)', 'Synthetic records. Columns I, J, K, L are formulas. Only retail leases enter the rent benchmark.')
cols = ['Record ID', 'Start date', 'District', 'Scope ring', 'Use', 'Frontage', 'Term (years)', 'Unit size (sqm)', 'Annual rent (SAR)', 'Rent (SAR/sqm/yr)', 'Months before as-of', 'In comp set', 'Comp value (SAR/sqm/yr)']
header(ws, 4, cols, [12, 12, 13, 10, 12, 12, 10, 12, 15, 14, 12, 11, 16])
for i, r in enumerate(rent, 5):
    vals = [r['id'], dt.date.fromisoformat(r['date']), r['district'], r['ring'], r['use'], r['frontage'], r['term'], r['size'], r['annual']]
    for j, v in enumerate(vals, 1):
        c = ws.cell(row=i, column=j, value=v); c.font = BLUE; c.border = thin
    ws.cell(row=i, column=2).number_format = 'yyyy-mm-dd'
    ws.cell(row=i, column=9).number_format = '#,##0'
    ws.cell(row=i, column=10, value=f'=IF(H{i}>0,I{i}/H{i},0)').number_format = '#,##0'
    ws.cell(row=i, column=11, value=f"=({BM}!$C$6-B{i})/30.44").number_format = '0.0'
    ws.cell(row=i, column=12, value=f'=IF(AND(E{i}="Retail",D{i}<={BM}!$C$9,K{i}<={BM}!$C$7),1,0)')
    ws.cell(row=i, column=13, value=f'=IF(L{i}=1,J{i},"")').number_format = '#,##0'
    for j in (10, 11, 12, 13): ws.cell(row=i, column=j).font = B; ws.cell(row=i, column=j).border = thin
ws.auto_filter.ref = f'A4:M{NR + 4}'
RT_COMP = f'Rentals!$M$5:$M${NR + 4}'

# Zoning rules
ws = wb.create_sheet('Zoning rules')
banner(ws, 'Zoning rules (DUMMY)', 'Synthetic rules for the demo, not actual Riyadh regulations.')
cols = ['Zone code', 'Description', 'Max FAR', 'Max site coverage', 'Front setback (m)', 'Side setback (m)', 'Rear setback (m)', 'Max floors', 'Parking per residential unit', 'Retail sqm per parking space', 'Permitted uses']
header(ws, 4, cols, [11, 32, 9, 12, 12, 12, 12, 10, 14, 14, 36])
for i, z in enumerate(zones, 5):
    for j, v in enumerate([z['code'], z['name'], z['far'], z['cov'], z['front'], z['side'], z['rear'], z['floors'], z['park_unit'], z['park_retail'], z['uses']], 1):
        c = ws.cell(row=i, column=j, value=v); c.font = BLUE; c.border = thin
    ws.cell(row=i, column=3).number_format = '0.0'; ws.cell(row=i, column=4).number_format = '0%'
ZR = f"'Zoning rules'!$A$5:$K${len(zones) + 4}"

# Plots
ws = wb.create_sheet('Plots')
banner(ws, 'Plots (DUMMY)', 'Synthetic plot register. NRJ-0417 is the demo site.')
cols = ['Plot ID', 'District', 'Zone code', 'Plot area (sqm)', 'Frontage (m)', 'Depth (m)', 'Street width (m)', 'Max GFA (sqm)', 'Note']
header(ws, 4, cols, [11, 13, 10, 13, 11, 10, 12, 13, 34])
for i, p in enumerate(plots, 5):
    for j, v in enumerate([p['id'], p['district'], p['zone'], p['area'], p['w'], p['d'], p['street']], 1):
        c = ws.cell(row=i, column=j, value=v); c.font = BLUE; c.border = thin
    ws.cell(row=i, column=4).number_format = '#,##0'
    c = ws.cell(row=i, column=8, value=f"=D{i}*INDEX('Zoning rules'!$C$5:$C${len(zones) + 4},MATCH(C{i},'Zoning rules'!$A$5:$A${len(zones) + 4},0))")
    c.font = GREEN; c.number_format = '#,##0'
    ws.cell(row=i, column=9, value=p['note']).font = B
PL = len(plots) + 4

# Outlook emails
ws = wb.create_sheet('Outlook emails')
banner(ws, 'Outlook inbox sample (DUMMY)', 'Synthetic emails. The agent extracts the proposed assumption change and cites the quote.')
cols = ['Received', 'From', 'Address', 'Subject', 'Body', 'Assumption', 'Proposed change', 'Quote used', 'Confidence']
header(ws, 4, cols, [16, 30, 26, 38, 70, 16, 14, 28, 11])
LAB = {'price': 'Sale price (%)', 'rent': 'Retail rent (%)', 'cost': 'Construction cost (%)', 'rate': 'Interest rate (pp)', 'ltc': 'Leverage LTC (pp)', 'delay': 'Delay (months)', 'area': 'Buildable area (%)'}
i = 5
for e in emails:
    ch = e['change']
    lines = [(ch['var'], ch['delta'], ch['quote'], ch['conf'])] if ch else [(None, None, 'No assumption content: ignored', None)]
    if ch and ch.get('also'): lines.append((ch['also']['var'], ch['also']['delta'], ch['also']['quote'], ch['conf']))
    for k, (var, delta, q, conf) in enumerate(lines):
        vals = [e['date'], e['from'], e['addr'], e['subject'], e['body'] if k == 0 else '(same email)', LAB.get(var, '-'), delta if delta is not None else '-', q, conf if conf else '-']
        for j, v in enumerate(vals, 1):
            c = ws.cell(row=i, column=j, value=v); c.font = B; c.border = thin; c.alignment = Alignment(wrap_text=True, vertical='top')
        if conf: ws.cell(row=i, column=9).number_format = '0%'
        i += 1

# Benchmarks
ws = wb['README']
ws = wb.create_sheet('Benchmarks', 1)
banner(ws, 'Market benchmarks (DUMMY data)', 'Change the blue inputs; percentiles and the model position recalculate.')
ws.column_dimensions['A'].width = 2; ws.column_dimensions['B'].width = 34
for c in 'CDEFGH': ws.column_dimensions[c].width = 16
ws['B4'] = 'Inputs'; ws['B4'].font = BB
inp = [('Comp scope', 'Al Narjis + adjacent', None), ('As-of date', AS_OF, 'yyyy-mm-dd'), ('Period (months)', 12, '0'), ('Property type', 'All', None)]
for k, (lab, v, fmt) in enumerate(inp, 5):
    ws.cell(row=k, column=2, value=lab).font = B
    c = ws.cell(row=k, column=3, value=v); c.font = BLUE; c.fill = YEL
    if fmt: c.number_format = fmt
ws['B9'] = 'Scope ring (derived)'; ws['B9'].font = B
ws['C9'] = '=MATCH(C5,{"Al Narjis","Al Narjis + adjacent","North Riyadh"},0)'; ws['C9'].font = B
ws['D5'] = 'Al Narjis / Al Narjis + adjacent / North Riyadh'; ws['D5'].font = Font(name=F, size=9, italic=True, color='808080')
ws['D8'] = 'All / Apartment / Townhouse / Duplex'; ws['D8'].font = Font(name=F, size=9, italic=True, color='808080')
dv = DataValidation(type='list', formula1='"Al Narjis,Al Narjis + adjacent,North Riyadh"', allow_blank=False); ws.add_data_validation(dv); dv.add('C5')
dv2 = DataValidation(type='list', formula1='"All,Apartment,Townhouse,Duplex"'); ws.add_data_validation(dv2); dv2.add('C8')
dv3 = DataValidation(type='list', formula1='"6,12,18,24"'); ws.add_data_validation(dv3); dv3.add('C7')

ws['B11'] = 'Model assumptions (from EstateMaster)'; ws['B11'].font = BB
ws['B12'] = 'Residential sale price (SAR/sqm)'; ws['C12'] = 13500
ws['B13'] = 'Retail rent (SAR/sqm/yr)'; ws['C13'] = 2400
for c in ('C12', 'C13'): ws[c].font = BLUE; ws[c].fill = YEL; ws[c].number_format = '#,##0'
ws['D12'] = 'Base case in the demo model'; ws['D12'].font = Font(name=F, size=9, italic=True, color='808080')

hdr = ['Benchmark', 'Comps (n)', 'P10', 'P25', 'Median', 'P75', 'P90']
for j, h in enumerate(hdr, 2):
    c = ws.cell(row=15, column=j, value=h); c.font = H; c.fill = HF
for r, (lab, rng) in zip((16, 17), (('Residential sale price (SAR/sqm)', TX_COMP), ('Retail rent (SAR/sqm/yr)', RT_COMP))):
    ws.cell(row=r, column=2, value=lab).font = B
    ws.cell(row=r, column=3, value=f'=COUNT({rng})').font = GREEN
    for j, p in zip(range(4, 9), (0.1, 0.25, 0.5, 0.75, 0.9)):
        c = ws.cell(row=r, column=j, value=f'=IFERROR(PERCENTILE({rng},{p}),0)'); c.font = GREEN; c.number_format = '#,##0'

for j, h in enumerate(['Model position', 'Model value', 'Percentile', 'Status', 'Gap to median'], 2):
    c = ws.cell(row=19, column=j, value=h); c.font = H; c.fill = HF
for r, src, mv, rng in ((20, 16, 'C12', TX_COMP), (21, 17, 'C13', RT_COMP)):
    ws.cell(row=r, column=2, value=f'=B{src}').font = B
    c = ws.cell(row=r, column=3, value=f'={mv}'); c.font = B; c.number_format = '#,##0'
    c = ws.cell(row=r, column=4, value=f'=IF(C{src}>0,COUNTIF({rng},"<"&C{r})/C{src},0)'); c.font = GREEN; c.number_format = '0%'
    ws.cell(row=r, column=5, value=f'=IF(OR(D{r}>=0.9,D{r}<=0.1),"Outside range",IF(OR(D{r}>0.75,D{r}<0.25),"Stretched","In range"))').font = BB
    c = ws.cell(row=r, column=6, value=f'=IF(F{src}>0,C{r}/F{src}-1,0)'); c.font = B; c.number_format = '+0.0%;-0.0%;-'
ws['B23'] = 'Status rule: percentile 25–75 in range; 10–25 or 75–90 stretched; outside 10–90 outside range (same rule as the demo).'
ws['B23'].font = Font(name=F, size=9, italic=True, color='808080')

# Regulation check
ws = wb.create_sheet('Regulation check', 2)
banner(ws, 'Regulation check (DUMMY rules)', 'Pick a plot and enter the scheme; each rule is checked against the zoning class.')
ws.column_dimensions['A'].width = 2; ws.column_dimensions['B'].width = 34
for c in 'CDEF': ws.column_dimensions[c].width = 18
ws['B4'] = 'Plot'; ws['B4'].font = BB
ws['B5'] = 'Plot ID'; ws['C5'] = 'NRJ-0417'; ws['C5'].font = BLUE; ws['C5'].fill = YEL
dvp = DataValidation(type='list', formula1=f'=Plots!$A$5:$A${PL}'); ws.add_data_validation(dvp); dvp.add('C5')
look = lambda col: f'=INDEX(Plots!${col}$5:${col}${PL},MATCH($C$5,Plots!$A$5:$A${PL},0))'
zl = lambda col: f"=INDEX('Zoning rules'!${col}$5:${col}${len(zones) + 4},MATCH($C$7,'Zoning rules'!$A$5:$A${len(zones) + 4},0))"
for r, lab, f, fmt in ((6, 'District', look('B'), None), (7, 'Zone code', look('C'), None), (8, 'Plot area (sqm)', look('D'), '#,##0'),
                       (9, 'Frontage x depth (m)', f'={look("E")[1:]}&" x "&{look("F")[1:]}', None), (10, 'Zone description', zl('B'), None)):
    ws.cell(row=r, column=2, value=lab).font = B
    c = ws.cell(row=r, column=3, value=f); c.font = GREEN
    if fmt: c.number_format = fmt
ws['B12'] = 'Scheme (from EstateMaster)'; ws['B12'].font = BB
sch = [('GFA (sqm)', 62000, '#,##0'), ('Building footprint (sqm)', 11400, '#,##0'), ('Floors (tallest block)', 11, '0'),
       ('Front setback provided (m)', 14, '0'), ('Side setback provided (m)', 25, '0'), ('Rear setback provided (m)', 10, '0'),
       ('Residential NSA (sqm)', 30000, '#,##0'), ('Average unit size (sqm)', 140, '0'), ('Retail GLA (sqm)', 12000, '#,##0'), ('Parking spaces provided', 620, '0')]
for k, (lab, v, fmt) in enumerate(sch, 13):
    ws.cell(row=k, column=2, value=lab).font = B
    c = ws.cell(row=k, column=3, value=v); c.font = BLUE; c.number_format = fmt
for j, h in enumerate(['Rule', 'Limit', 'Scheme', 'Status', 'Headroom'], 2):
    c = ws.cell(row=24, column=j, value=h); c.font = H; c.fill = HF
checks = [
    ('FAR', zl('C'), '=C13/C8', '=IF(D25<=C25+0.0001,"Compliant","Breach")', '=C25*C8-C13', '0.00', '#,##0" sqm GFA"'),
    ('Site coverage', zl('D'), '=C14/C8', '=IF(D26<=C26,"Compliant","Breach")', '=C26*C8-C14', '0%', '#,##0" sqm"'),
    ('Front setback (m)', zl('E'), '=C16', '=IF(D27>=C27,"Compliant","Breach")', '=D27-C27', '0', '0" m"'),
    ('Side setback (m)', zl('F'), '=C17', '=IF(D28>=C28,"Compliant","Breach")', '=D28-C28', '0', '0" m"'),
    ('Rear setback (m)', zl('G'), '=C18', '=IF(D29>=C29,"Compliant","Breach")', '=D29-C29', '0', '0" m"'),
    ('Max floors', zl('H'), '=C15', '=IF(D30<=C30,"Compliant","Breach")', '=C30-D30', '0', '0" floors"'),
    ('Parking spaces required', f"=ROUNDUP(C19/C20*{zl('I')[1:]}+IF({zl('J')[1:]}>0,C21/{zl('J')[1:]},0),0)", '=C22', '=IF(D31>=C31,"Compliant","Breach")', '=D31-C31', '0', '0" spaces"'),
]
for k, (lab, lim, sc, st, hd, fmt, hfmt) in enumerate(checks, 25):
    ws.cell(row=k, column=2, value=lab).font = B
    c = ws.cell(row=k, column=3, value=lim); c.font = GREEN; c.number_format = fmt
    c = ws.cell(row=k, column=4, value=sc); c.font = B; c.number_format = fmt
    ws.cell(row=k, column=5, value=st).font = BB
    c = ws.cell(row=k, column=6, value=hd); c.font = B; c.number_format = hfmt + ';-' + hfmt + ';-'
ws['B33'] = 'Negative headroom = breach. Parking: units = NSA / average unit size.'
ws['B33'].font = Font(name=F, size=9, italic=True, color='808080')

wb.save(Path(__file__).resolve().parent.parent / 'market-data.xlsx')
print('tx', len(tx), 'rent', len(rent))

# Embed the same data into the demo page so the two never drift apart.
html = Path(__file__).resolve().parent.parent / 'index.html'
if html.exists():
    import re
    s = html.read_text(encoding='utf8')
    blob = json.dumps({'asOf': AS_OF.isoformat(), 'tx': tx, 'rent': rent, 'zones': zones, 'plots': plots, 'emails': emails}, separators=(',', ':'))
    s2 = re.sub(r'(<script id="mkdata" type="application/json">).*?(</script>)', lambda m: m.group(1) + blob + m.group(2), s, flags=re.S)
    if s2 != s:
        html.write_text(s2, encoding='utf8'); print('embedded data into index.html')

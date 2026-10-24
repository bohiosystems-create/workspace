# The value-meaning family, written down and generated: every kind of value a row can hold, under every way a sheet or a label can
# state an amounts unit (and the headings that look like one and are not), with the truth known by construction. tests/t_valuemeaning.mjs
# reads each workbook in the app and checks every cell's reading and every display and conversion of it against this truth.
# python3 -I gen/gen_valuemeaning.py → models/vm_*.xlsx and golden/valuemeaning.json
#
# The family (what a number in a row can mean):
#   money     an amount (land, cost, rent roll, fees paid, commitments): takes its own unit if the label states one, else the
#             column's, else the sheet's
#   per_area  money per sqm / sq ft (a sale price, a build cost, a rent rate): may be in the sheet's thousands (SAR '000 per sqm) or
#             not ($ per sf on a $000s sheet), so it is never shown scaled; a typed number is matched to it by magnitude
#   per_unit  money per key / unit / bed / room, ADR, a unit price: as per_area
#   area      sqm, sq ft, GFA, NLA, NSA: never scaled, never money
#   count     units, keys, beds, a unit mix: never scaled, never money
#   pct       a rate, a share, a yield (a fraction, a % format, or whole percents in a (%) row)
#   x         a multiple, a cover ratio
#   time      a duration (months, years, quarters) or a period number (exit year, launch month)
# Ways an amounts unit is stated: none; thousands ($000s, SAR '000, in thousands, USD k, بالآلاف, ألف ريال); millions (SAR m, £m,
# in millions, بالملايين); in the sheet heading, in a column heading, or in the row's own label. Headings that look like a unit and
# are not: (sqm), (£/sqm), (sq m), (m²), (months), (park), (sqm GIA).
import openpyxl, os, json, random
D = os.path.join(os.path.dirname(__file__), '..', 'models'); G = os.path.join(os.path.dirname(__file__), '..', 'golden')
SEED = int(os.environ.get('VM_SEED', '4848')); HOLD = os.environ.get('VM_HOLDOUT') in ('1', '2'); HOLD2 = os.environ.get('VM_HOLDOUT') == '2'
R = random.Random(SEED)
if os.environ.get('VM_OUT'): D = G = os.environ['VM_OUT']

# (label, value, kind); a label may carry its own unit, written as {k} or {m} and filled per variant
ROWS = {
 'money': [('Land', 38_000_000), ('Land cost', 25_000_000), ('Soft costs', 9_500_000), ('Construction cost', 200_000_000),
           ('Fund expenses (a year)', 350_000), ('Stabilised rent', 30_000_000), ('Total commitments', 150_000_000),
           ('Pre-opening and FF&E (total)', 48_000_000), ('Contingency amount', 4_000_000), ('Marketing budget', 1_200_000),
           ('تكلفة الأرض', 120_000_000), ('إيرادات التأجير السنوية', 18_000_000)],
 'per_area': [('Sale price ($/sf)', 680), ('Hard cost ($/sf)', 320), ('Sales price (£/sqm)', 8500), ('Build cost (£/sqm GIA)', 2800),
              ('Construction cost per sqm', 7500), ('Retail rent per sqm pa', 1200), ('Residential sale price per sqm', 12),
              ('سعر البيع للمتر المربع', 6500)],
 'per_unit': [('Construction cost per key', 1_150_000), ('Operating costs per unit (a year)', 9500), ('Stabilised ADR', 780),
              ('Unit price', 2_400_000), ('2-bed · Rent (a Month)', 8600)],
 'area': [('Rentable area (sf)', 150_000), ('Gross internal area (sqm)', 12_000), ('Residential NSA (sqm)', 30_000), ('GFA (sqm)', 50_000),
          ('Site area (sqm)', 6500), ('Retail NLA (sqm)', 8000)],
 'count': [('Keys', 320), ('Units', 240), ('Studio', 60), ('Number of villas', 85), ('Parking spaces', 410)],
 'pct': [('Loan to cost (%)', 60), ('Interest rate', 0.07), ('Exit yield', 0.075), ('Selling costs', 0.02), ('Stabilised occupancy', 0.94),
         ('Rent growth (a year)', 0.03), ('Preferred return', 0.08), ('GP catch-up', 1.0), ('Management fee (on commitments)', 0.015)],
 'x': [('Exit EBITDA multiple', 13.5), ('Minimum DSCR covenant', 1.25)],
 'time': [('Hold (months)', 30), ('Exit year', 10), ('Launch month', 6), ('Construction length (quarters)', 6),
          ('Amortisation (years after opening)', 20), ('Lease-up months', 12), ('Investment period (years)', 4)],
}
# a held-out pool (VM_HOLDOUT=1): other words for the same kinds, never used while the classifier was written; it must read them too
if HOLD:
    ROWS = {
     'money': [('Purchase price', 61_000_000), ('Ground rent payable', 450_000), ('Developer overheads', 2_100_000), ('Equity raised', 90_000_000),
               ('Capital expenditure', 14_000_000), ('Finance arrangement cost', 650_000), ('Gross development value', 310_000_000), ('قيمة الاستحواذ', 75_000_000)],
     'per_area': [('Price per sq ft', 925), ('Hard costs per GFA sqm', 6100), ('Office rent ($ psf)', 48), ('Fit-out (£/sq ft)', 85), ('تكلفة البناء لكل متر', 3200)],
     'per_unit': [('Average price per apartment', 1_850_000), ('FF&E per key', 145_000), ('Monthly rent per unit', 7200)],
     'area': [('Average unit size (sqm)', 92), ('Plot area (sq m)', 18_000), ('Net lettable area (NLA)', 26_000), ('Office GIA (sq ft)', 210_000)],
     'count': [('Number of keys', 280), ('Bedrooms', 640), ('Townhouses', 48), ('Number of plots', 120)],
     'pct': [('Cap rate', 0.0625), ('Developer margin (%)', 18), ('LTV', 0.65), ('Vacancy allowance', 0.05), ('Construction inflation', 0.035), ('Carried interest', 0.2)],
     'x': [('Target equity multiple', 1.9), ('Interest cover covenant', 2.0)],
     'time': [('Development period (months)', 36), ('Sales year', 4), ('Stabilisation month', 30), ('Hold period (years)', 7)],
    }
if HOLD2:
    ROWS = {
     'money': [('Site acquisition', 42_000_000), ('Professional fees', 3_300_000), ('Leasing commissions', 780_000), ('Sales and marketing', 2_400_000),
               ('Senior loan amount', 120_000_000), ('Mezzanine tranche', 25_000_000), ('Annual service charge income', 1_900_000), ('مصاريف التسويق', 2_000_000)],
     'per_area': [('Blended rent (SAR/sqm/yr)', 1450), ('Land rate per sqm of plot', 5200), ('Construction (USD/sf)', 410), ('سعر الإيجار للمتر', 900)],
     'per_unit': [('Fit-out cost per villa', 380_000), ('Average daily rate', 640), ('Price per townhouse', 3_100_000)],
     'area': [('Total BUA (sqm)', 64_000), ('Leasable area', 22_000), ('Land size (acres)', 12)],
     'count': [('No. of apartments', 410), ('Hotel rooms', 250), ('Car parking bays', 900)],
     'pct': [('Discount rate', 0.09), ('Absorption (% per year)', 25), ('Occupancy at stabilisation', 0.92), ('Cost overrun allowance', 0.05), ('Hurdle', 0.12)],
     'x': [('Exit multiple (x)', 11.0), ('Min ICR', 1.5)],
     'time': [('Construction period (months)', 30), ('Completion year', 3), ('Sell-out (quarters)', 6)],
    }
PCT_FMT = {'Discount rate', 'Occupancy at stabilisation', 'Cost overrun allowance', 'Hurdle', 'Cap rate', 'LTV', 'Vacancy allowance', 'Construction inflation', 'Carried interest','Interest rate', 'Exit yield', 'Selling costs', 'Stabilised occupancy', 'Rent growth (a year)', 'Preferred return',
           'GP catch-up', 'Management fee (on commitments)'}
# each sheet: (sheet name, heading, the unit the heading states — 1 when it is a trap — and the currency)
SHEETS = [
 ('Plain', 'RIVERSIDE GARDENS · residential scheme', 1, 'GBP'),
 ('Thousands', 'Pro forma ($000s)', 1000, 'USD'),
 ('SAR000', "AL BAHR – INPUTS (SAR '000)", 1000, 'SAR'),
 ('InThousands', 'Assumptions, all amounts in thousands', 1000, 'EUR'),
 ('Millions', 'Cash flow (SAR m)', 1e6, 'SAR'),
 ('GBPm', 'Development appraisal (£m)', 1e6, 'GBP'),
 ('ArK', 'المدخلات (بالآلاف ريال)', 1000, 'SAR'),
 ('ArM', 'التدفقات النقدية (بالملايين)', 1e6, 'SAR'),
 ('TrapSqm', 'Areas (sqm) and prices (£/sqm)', 1, 'GBP'),
 ('TrapSqm2', 'Site schedule (sq m) · (m²)', 1, 'SAR'),
 ('TrapMonths', 'Programme (months)', 1, 'USD'),
 ('TrapPark', 'Car park (park) and GIA (sqm GIA)', 1, 'AED'),
]
OWN = {1000: [" ($000s)", " (SAR '000)", " (USD k)", " (ألف ريال)"], 1e6: [" (SAR m)", " (£m)", " (USD mn)"]}

def build(name, sheets):
    wb = openpyxl.Workbook(); wb.remove(wb.active); truth = {'sheets': {}, 'cells': {}}; money_refs = []
    for sn, head, unit, ccy in sheets:
        ws = wb.create_sheet(sn); ws['A1'] = head; truth['sheets'][sn] = {'unit': unit, 'ccy': ccy}; r = 3
        picks = []
        for kind, pool in ROWS.items():
            for lab, v in R.sample(pool, min(len(pool), 2 if kind in ('money', 'per_area', 'pct') else 1)): picks.append((kind, lab, v))
        R.shuffle(picks)
        # one money row with its own unit, different from the sheet's: the row's own word wins
        own_u = R.choice([1000, 1e6]); own_lab = R.choice(['Land acquisition', 'Equity commitment', 'Senior debt facility']) + R.choice(OWN[own_u])
        picks.insert(R.randrange(len(picks)), ('money', own_lab, R.choice([12_000, 45_500, 250]) if own_u == 1000 else R.choice([12.5, 48, 210])))
        for kind, lab, v in picks:
            ws.cell(r, 1, lab); c = ws.cell(r, 2, v)
            if lab in PCT_FMT: c.number_format = '0.00%'
            elif kind == 'money': c.number_format = '#,##0'
            ref = f"{sn}!B{r}"
            own = own_u if lab == own_lab else 1
            sc_money = own if own > 1 else unit
            truth['cells'][ref] = {'label': lab, 'v': v, 'kind': kind,
                                   # the amount the cell means, when it is a money amount; a per-area or per-unit price is never scaled for show
                                   'show_scale': sc_money if kind == 'money' else 1,
                                   # the unit a typed number may be in: an amount's, or a price's when the sheet is in thousands
                                   'conv_scale': sc_money if kind in ('money', 'per_area', 'per_unit') else 1,
                                   'whole_pct': kind == 'pct' and lab.endswith('(%)')}
            if kind == 'money': money_refs.append(ref)
            r += 1
        # a column-unit table: the column heading states the unit, the sheet heading does not
        if sn == 'Plain':
            r += 1; ws.cell(r, 1, 'Item'); ws.cell(r, 2, "Amount (SAR '000)"); ws.cell(r, 3, 'Area (sqm)'); r += 1
            for lab, a, ar in [('Retail podium', 85_000, 12_000), ('Office tower', 240_000, 31_000)]:
                ws.cell(r, 1, lab); ws.cell(r, 2, a); ws.cell(r, 3, ar)
                truth['cells'][f"{sn}!B{r}"] = {'label': lab, 'v': a, 'kind': 'money', 'show_scale': 1000, 'conv_scale': 1000, 'col': True}
                truth['cells'][f"{sn}!C{r}"] = {'label': lab, 'v': ar, 'kind': 'area', 'show_scale': 1, 'conv_scale': 1, 'col': True}
                r += 1
    rs = wb.create_sheet('Returns'); rs['A1'] = 'Returns'
    rs['A3'] = 'Total cost (all money rows, in units)'
    rs['B3'] = '=' + '+'.join(f"{ref.split('!')[0]}!{ref.split('!')[1]}*{int(truth['cells'][ref]['show_scale'])}" for ref in money_refs)
    rs['A4'] = 'Levered IRR'; rs['B4'] = '=0.1+B3*0'; rs['B4'].number_format = '0.00%'
    truth['total'] = sum(truth['cells'][r]['v'] * truth['cells'][r]['show_scale'] for r in money_refs)
    wb.save(os.path.join(D, name)); return truth

out = {}
for i, part in enumerate([SHEETS[0:4], SHEETS[4:8], SHEETS[8:12]]):
    out[f'vm_{i + 1}.xlsx'] = build(f'vm_{i + 1}.xlsx', part)
json.dump(out, open(os.path.join(G, 'valuemeaning.json'), 'w'), indent=1, ensure_ascii=False)
print({k: len(v['cells']) for k, v in out.items()})

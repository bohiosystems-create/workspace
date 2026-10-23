# Round 42 (synthetic): workbooks at the edges. python3 -I gen/gen_r42edge.py → models/r42_*.xlsx
#  r42_textnums_sar: inputs typed as text ("7.5%", "1,200,000") and in Eastern Arabic digits (٦٥٠٠); a label holding HTML
#  r42_errors_usd:   a #REF! in a side calculation, an IRR whose cash flow never turns positive (no IRR), and a working levered IRR
#  r42_wide_usd:     a 50-year monthly timeline (600 columns), returns by XIRR on dates, a hidden sheet holding a typed input
#  r42_modern_usd:   modern functions (XLOOKUP, LET, SUMPRODUCT, SEQUENCE) on the path to the IRR
import openpyxl, os, datetime
from openpyxl.utils import get_column_letter as L
D = os.path.join(os.path.dirname(__file__), '..', 'models')
# 1. text numbers, Arabic digits, an HTML label
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Inputs'
for r in [('RAWDA GARDENS – TEXT INPUTS (SAR)', None), ('Units', 200), ('Sale price per unit', '1,200,000'), ('Construction cost per unit', '٦٥٠٠٠٠'),
          ('Land', 40000000), ('Finance rate', '7.5%'), ('<img src=x onerror=alert(1)> Marketing', 0.02)]:
    ws.append(list(r))
cf = wb.create_sheet('Cash Flow'); cf.append(['Year', 1, 2, 3])
cf.append(['Revenue', 0, '=0.5*Inputs!B2*VALUE(SUBSTITUTE(Inputs!B3,",",""))', '=0.5*Inputs!B2*VALUE(SUBSTITUTE(Inputs!B3,",",""))'])
cf.append(['Costs', '=-Inputs!B5-0.5*Inputs!B2*650000', '=-0.5*Inputs!B2*650000', 0])
cf.append(['Marketing', 0, '=-B2*0', '=-(C2+D2)*Inputs!B7'])
cf.append(['Net cash flow', '=B2+B3+B4', '=C2+C3+C4', '=D2+D3+D4'])
r = wb.create_sheet('Returns'); r.append(['Unlevered IRR', "=IRR('Cash Flow'!B5:D5)"]); r.append(['Net profit', "=SUM('Cash Flow'!B5:D5)"])
wb.save(os.path.join(D, 'r42_textnums_sar.xlsx'))
# 2. errors: a #REF!, an IRR with no root
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Inputs'
for r in [('DUNE LOGISTICS – ERRORS (USD)', None), ('Rent a year', 3000000), ('Exit value', 30000000), ('Cost', 34000000), ('Loan', 20000000)]:
    ws.append(list(r))
cf = wb.create_sheet('Cash Flow'); cf.append(['Year', 0, 1, 2, 3])
cf.append(['Unlevered', '=-Inputs!B4', '=Inputs!B2', '=Inputs!B2', '=Inputs!B2+Inputs!B3'])
cf.append(['Debt', '=Inputs!B5', '=-Inputs!B5*0.07', '=-Inputs!B5*0.07', '=-Inputs!B5*1.07'])
cf.append(['Levered', '=B2+B3', '=C2+C3', '=D2+D3', '=E2+E3'])
cf.append(['Side check', '=#REF!*2', None, None, None])
cf.append(['Developer fee stream', -5000000, -100000, -100000, -100000])
r = wb.create_sheet('Returns'); r.append(['Levered IRR', "=IRR('Cash Flow'!B4:E4)"]); r.append(['Unlevered IRR', "=IRR('Cash Flow'!B2:E2)"]); r.append(['Fee IRR', "=IRR('Cash Flow'!B6:E6)"])
wb.save(os.path.join(D, 'r42_errors_usd.xlsx'))
# 3. a 50-year monthly timeline with XIRR on dates; a hidden sheet with an input the returns read
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Inputs'
for r in [('LONG LEASE – 50 YEARS MONTHLY (USD)', None), ('Price', 100000000), ('Rent a month', 600000), ('Rent growth a year', 0.02), ('Exit yield', 0.05)]:
    ws.append(list(r))
h = wb.create_sheet('Hidden'); h.append(['Management fee share', 0.03]); h.sheet_state = 'hidden'
cf = wb.create_sheet('Cash Flow'); n = 600
cf.cell(1, 1, 'Month'); cf.cell(2, 1, 'Date'); cf.cell(3, 1, 'Net cash flow')
for i in range(n + 1):
    c = i + 2; cl = L(c)
    cf.cell(1, c, i)
    cf.cell(2, c, f'=EDATE(DATE(2027,1,31),{cl}1)')
    if i == 0: cf.cell(3, c, '=-Inputs!B2')
    elif i < n: cf.cell(3, c, f'=Inputs!B3*(1+Inputs!B4)^INT(({cl}1-1)/12)*(1-Hidden!B1)')
    else: cf.cell(3, c, f'=Inputs!B3*(1+Inputs!B4)^INT(({cl}1-1)/12)*(1-Hidden!B1)+Inputs!B3*12*(1+Inputs!B4)^50/Inputs!B5')
    cf.cell(2, c).number_format = 'mmm-yy'
last = L(n + 2)
r = wb.create_sheet('Returns'); r.append(['Unlevered IRR', f"=XIRR('Cash Flow'!B3:{last}3,'Cash Flow'!B2:{last}2)"]); r.append(['Net profit', f"=SUM('Cash Flow'!B3:{last}3)"])
wb.save(os.path.join(D, 'r42_wide_usd.xlsx'))
# 4. modern functions on the path to the IRR
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Inputs'
for r in [('MODERN TOWER – NEW FUNCTIONS (USD)', None), ('Scenario', 'Base'), ('Units', 150), ('Cost per unit', 400000)]:
    ws.append(list(r))
t = wb.create_sheet('Prices'); t.append(['Scenario', 'Price per unit']); t.append(['Base', 600000]); t.append(['Low', 520000])
cf = wb.create_sheet('Cash Flow'); cf.append(['Year', 0, 1, 2])
cf.append(['Revenue', 0, '=_xlfn.LET(p,_xlfn.XLOOKUP(Inputs!B2,Prices!A2:A3,Prices!B2:B3),u,Inputs!B3,p*u/2)', '=C2'])
cf.append(['Cost', '=-SUMPRODUCT(Inputs!B3,Inputs!B4)', 0, 0])
cf.append(['Net', '=B2+B3', '=C2+C3', '=D2+D3'])
r = wb.create_sheet('Returns'); r.append(['Unlevered IRR', "=IRR('Cash Flow'!B4:D4)"]); r.append(['Net profit', "=SUM('Cash Flow'!B4:D4)"])
wb.save(os.path.join(D, 'r42_modern_usd.xlsx'))

# Round 43 (synthetic): models at the edges of Excel, for a CIO day across the app's features. python3 -I gen/gen_c43.py → models/c43_*.xlsx
#  c43_jv_circ_sar   a development JV: a construction loan whose interest is funded by the loan itself (a circular reference, iterative
#                    calculation on), a hold-period input timing the sale, and an LP/GP waterfall (8% compounding pref, then 80/20)
#  c43_dyn_usd       a lease-up model on Excel 365: years spilled by SEQUENCE, rent from an Excel table by structured references
#                    (Leases[Area]…), FILTER and UNIQUE on the table, XNPV on dates, a defined name
import openpyxl, os
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.properties import CalcProperties
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.workbook.defined_name import DefinedName
D = os.path.join(os.path.dirname(__file__), '..', 'models')

# 1. the circular JV
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Inputs'
rows = [('AL MANAR TOWERS JV – DEVELOPMENT (SAR)', None), ('Land', 50000000), ('Construction cost', 200000000), ('Loan to cost', 0.60),
        ('Interest rate', 0.08), ('Stabilised rent', 30000000), ('Rent growth', 0.03), ('Exit yield', 0.075), ('Hold period (years)', 8),
        ('Selling costs', 0.02), ('LP share of equity', 0.90), ('Preferred return', 0.08), ('LP share above the pref', 0.80)]
for r in rows: ws.append(list(r))
cf = wb.create_sheet('Cash Flow'); N = 10
lab = ['Year', 'Land', 'Construction', 'Interest', 'Total cost', 'Loan draw', 'Loan balance', 'NOI', 'Sale proceeds', 'Loan repayment',
       'Unlevered cash flow', 'Equity cash flow', 'LP contribution', 'GP contribution', 'Distributions', 'Hurdle balance', 'LP to pref',
       'Above the pref', 'LP cash flow', 'GP cash flow']
for i, t in enumerate(lab): cf.cell(i + 1, 1, t)
phase = [0.3, 0.4, 0.3]
for i in range(N):
    c = i + 2; k = L(c); p = L(c - 1)
    cf[f'{k}1'] = i + 1
    cf[f'{k}2'] = '=Inputs!$B$2' if i == 0 else 0
    cf[f'{k}3'] = f'=Inputs!$B$3*{phase[i]}' if i < 3 else 0
    prevbal = f'{p}7' if i else '0'
    cf[f'{k}4'] = f'=Inputs!$B$5*({prevbal}+{k}6/2)*({k}1<=Inputs!$B$9)'          # interest on the opening balance and half the year's draw: circular
    cf[f'{k}5'] = f'={k}2+{k}3+IF({k}1<=3,{k}4,0)'                                   # interest is capitalised during construction
    cf[f'{k}6'] = f'=IF({k}1<=3,Inputs!$B$4*{k}5,0)'
    cf[f'{k}7'] = f'=IF({k}1<=Inputs!$B$9,{prevbal}+{k}6-{k}10,0)'
    cf[f'{k}8'] = f'=IF(AND({k}1>3,{k}1<=Inputs!$B$9),Inputs!$B$6*(1+Inputs!$B$7)^({k}1-4),0)'
    cf[f'{k}9'] = f'=IF({k}1=Inputs!$B$9,Inputs!$B$6*(1+Inputs!$B$7)^({k}1-3)/Inputs!$B$8*(1-Inputs!$B$10),0)'
    cf[f'{k}10'] = f'=IF({k}1=Inputs!$B$9,{prevbal}+{k}6,0)'
    cf[f'{k}11'] = f'=-{k}2-{k}3+{k}8+{k}9'
    cf[f'{k}12'] = f'=-{k}5+{k}6+{k}8-IF({k}1>3,{k}4,0)+{k}9-{k}10'
    cf[f'{k}13'] = f'=MAX(0,-{k}12)*Inputs!$B$11'
    cf[f'{k}14'] = f'=MAX(0,-{k}12)*(1-Inputs!$B$11)'
    cf[f'{k}15'] = f'=MAX(0,{k}12)'
    prevhb = f'{p}16' if i else '0'
    cf[f'{k}17'] = f'=MIN({k}15,MAX(0,{prevhb}*(1+Inputs!$B$12)+{k}13))'
    cf[f'{k}16'] = f'={prevhb}*(1+Inputs!$B$12)+{k}13-{k}17'
    cf[f'{k}18'] = f'={k}15-{k}17'
    cf[f'{k}19'] = f'=-{k}13+{k}17+{k}18*Inputs!$B$13'
    cf[f'{k}20'] = f'=-{k}14+{k}18*(1-Inputs!$B$13)'
last = L(N + 1)
r = wb.create_sheet('Returns')
for t, f in [('Levered IRR', f"=IRR('Cash Flow'!B12:{last}12)"), ('Unlevered IRR', f"=IRR('Cash Flow'!B11:{last}11)"), ('LP IRR', f"=IRR('Cash Flow'!B19:{last}19)"),
             ('GP IRR', f"=IRR('Cash Flow'!B20:{last}20)"), ('Net profit', f"=SUM('Cash Flow'!B12:{last}12)"), ('Peak debt', f"=MAX('Cash Flow'!B7:{last}7)"),
             ('Equity multiple', f"=SUMIF('Cash Flow'!B12:{last}12,\">0\")/-SUMIF('Cash Flow'!B12:{last}12,\"<0\")"),
             ('Waterfall tier reached', f"=IF(SUM('Cash Flow'!B18:{last}18)>0,\"Promote\",\"Pref only\")")]:
    r.append([t, f])
wb.calculation = CalcProperties(iterate=True, iterateCount=200, iterateDelta=1e-9, fullCalcOnLoad=True)
wb.save(os.path.join(D, 'c43_jv_circ_sar.xlsx'))

# 2. dynamic arrays and an Excel table
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Inputs'
for r in [('HARBOUR LEASE-UP – EXCEL 365 (USD)', None), ('Purchase price', 60000000), ('Rent growth', 0.025), ('Exit yield', 0.065), ('Discount rate', 0.09), ('Hold (years)', 10)]:
    ws.append(list(r))
wb.defined_names['DiscRate'] = DefinedName('DiscRate', attr_text='Inputs!$B$5')
ls = wb.create_sheet('Leases'); ls.append(['Tenant', 'Area', 'Rent psm', 'Start year'])
for t in [('Anchor', 12000, 180, 1), ('Gym', 3000, 150, 2), ('Cafe', 800, 320, 1), ('Anchor', 4000, 175, 3), ('Clinic', 2500, 210, 4)]: ls.append(list(t))
tab = Table(displayName='Leases', ref='A1:D6'); tab.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2'); ls.add_table(tab)
cf = wb.create_sheet('Cash Flow')
cf['A1'] = 'Year'; cf['B1'] = '=_xlfn.SEQUENCE(1,10)'
cf['A2'] = 'Date'
cf['A3'] = 'Rent'
cf['A4'] = 'Purchase and sale'
cf['A5'] = 'Net cash flow'
for i in range(10):
    k = L(i + 2)
    cf[f'{k}2'] = f'=DATE(2026+{k}1,12,31)'
    cf[f'{k}3'] = f'=SUMPRODUCT((Leases[Start year]<={k}1)*Leases[Area]*Leases[Rent psm])*(1+Inputs!$B$3)^({k}1-1)'
    cf[f'{k}4'] = f'=IF({k}1=1,-Inputs!$B$2,0)+IF({k}1=Inputs!$B$6,{k}3*(1+Inputs!$B$3)/Inputs!$B$4,0)'
    cf[f'{k}5'] = f'={k}3+{k}4'
r = wb.create_sheet('Returns')
for t, f in [('Unlevered IRR', "=IRR('Cash Flow'!B5:K5)"), ('NPV at the discount rate', "=_xlfn.XNPV(DiscRate,'Cash Flow'!B5:K5,'Cash Flow'!B2:K2)" if False else "=XNPV(DiscRate,'Cash Flow'!B5:K5,'Cash Flow'!B2:K2)"),
             ('Net profit', "=SUM('Cash Flow'!B5:K5)"), ('Tenants', "=COUNTA(_xlfn.UNIQUE(Leases[Tenant]))"), ('Anchor area', '=SUM(_xlfn._xlws.FILTER(Leases[Area],Leases[Tenant]="Anchor"))'),
             ('Total area', '=SUM(Leases[Area])')]:
    r.append([t, f])
wb.save(os.path.join(D, 'c43_dyn_usd.xlsx'))

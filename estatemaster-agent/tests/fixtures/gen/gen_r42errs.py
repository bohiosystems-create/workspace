# Round 42 (synthetic): errors already in a workbook, for the debug to trace to their cause. python3 -I gen/gen_r42errs.py → models/r42_errs_sar.xlsx
#  #VALUE!  rent per sqm typed as the text "1,200 SAR" → rent → the cash flow → the levered IRR (a headline): one cause, a chain behind it
#  #DIV/0!  fit-out per unit divides by Units, typed 0
#  #N/A     a lookup on "phase 2 " (a trailing space, lower case) where the table has "Phase 2"
#  #REF!    one cell of an index row whose neighbours all read the period and the rent per sqm
#  #NAME?   a misspelt function (SUMM)
#  #NUM!    an IRR on a fee stream that is never positive
import openpyxl, os
D = os.path.join(os.path.dirname(__file__), '..', 'models')
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Inputs'
for r in [('NAKHEEL PLAZA – ERRORS TO TRACE (SAR)', None), ('Rent per sqm', '1,200 SAR'), ('NLA', 10000), ('Units', 0), ('Total fit-out', 5000000), ('Phase', 'phase 2 '), ('Purchase price', 30000000)]:
    ws.append(list(r))
lk = wb.create_sheet('Lookup'); lk.append(['Phase', 'Price uplift'])
for k, v in [('Phase 1', 1.00), ('Phase 2', 1.05), ('Phase 3', 1.10)]: lk.append([k, v])
c = wb.create_sheet('Calc')
c['A1'] = 'Rent a year'; c['B1'] = '=Inputs!B2*Inputs!B3'
c['A2'] = 'Rent net of costs'; c['B2'] = '=B1*0.9'
c['A3'] = 'Fit-out per unit'; c['B3'] = '=Inputs!B5/Inputs!B4'
c['A4'] = 'Phase uplift'; c['B4'] = '=VLOOKUP(Inputs!B6,Lookup!A2:B4,2,FALSE)'
c['A5'] = 'Check total'; c['B5'] = '=SUMM(B1:B2)'
c['A10'] = 'Year'
for i, col in enumerate('BCDE'): c[f'{col}10'] = i + 1
c['A11'] = 'Index'
for col in 'BCDE': c[f'{col}11'] = f'={col}10*Inputs!$B$3'
c['C11'] = '=#REF!*Inputs!$B$3'
c['A20'] = 'Cash flow'; c['B20'] = '=-Inputs!B7'
for col in 'CDE': c[f'{col}20'] = '=$B$2'
c['E20'] = '=$B$2+$B$2/0.07'
c['A21'] = 'Fee stream'
for col in 'BCDE': c[f'{col}21'] = -100000
r = wb.create_sheet('Returns')
r.append(['Levered IRR', "=IRR(Calc!B20:E20)"]); r.append(['Unlevered IRR', "=IRR(Calc!B21:E21)"]); r.append(['Net profit', "=SUM(Calc!B20:E20)"])
wb.save(os.path.join(D, 'r42_errs_sar.xlsx'))

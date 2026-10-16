# round 11: five model types not tried before
#  lab   - life-sciences lab conversion, USD, suite-by-suite lease-up with TI and free rent (rentable sf, $/rsf NNN)
#  solar - solar park, EUR, MWp, specific yield, PPA price with a merchant tail, degradation, senior debt sculpted on DSCR
#  rv    - retirement village with a deferred management fee (DMF) and resales, NZD
#  ffund - Swedish logistics forward funding, SEK: fund pays costs plus a coupon, developer earns the profit at practical completion
#  ppp   - hospital availability-payment PPP, KWD: indexed unitary charge, lifecycle, deductions, equity IRR
import openpyxl
from openpyxl.utils import get_column_letter as L
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m11/'
import os;os.makedirs(OUT+'calc',exist_ok=True)
P='0.00%';N='#,##0';N2='#,##0.00'
def inputs(ws,rows,col=2,start=3,notes=False):
    I={};r=start
    for t in rows:
        k,lab,v,f=t[:4];ws.cell(r,1,lab);c=ws.cell(r,col,v);c.number_format=f
        if notes and len(t)>4:ws.cell(r,col+2,t[4])
        I[k]=f"'{ws.title}'!${L(col)}${r}" if ' ' in ws.title else f"{ws.title}!${L(col)}${r}";r+=1
    return I
def summary(wb,name,rows,start=3):
    s=wb.create_sheet(name)
    for i,(lab,f,fm) in enumerate(rows):s.cell(start+i,1,lab);c=s.cell(start+i,2,f);c.number_format=fm
    return s

# ---------- lab conversion, USD ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='KENDALL WORKS – OFFICE TO LAB CONVERSION (USD)'
I=inputs(ws,[('buy','Acquisition price',182000000,N),('conv','Conversion cost ($/rsf)',310,N),('tic','Closing costs',0.02,P),('exit','Exit cap rate',0.0575,P),
  ('opex','Non-recoverable opex ($/rsf)',4.5,N2),('growth','Rent bumps (annual)',0.03,P),('ltc','Loan to cost',0.55,P),('rate','Loan rate (SOFR + spread)',0.0725,P),('hold','Hold (years)',6,'0')])
rr=wb.create_sheet('Lease-Up');rr.append(['Suite','RSF','Base rent ($/rsf NNN)','Lease start (year)','Free rent (months)','TI allowance ($/rsf)','Term (years)'])
for r in [('Suite 100',62000,98,1,10,185,10),('Suite 200',58000,96,2,9,175,10),('Suite 300',71000,94,2,12,190,12),('Suite 400',45000,99,3,8,160,7)]:rr.append(list(r))
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';labs=['Rental income','Free rent','Opex','TI','Conversion','Acquisition','Sale','Unlevered cash flow','Loan draw / (repay)','Interest','Levered cash flow']
R={l:4+i for i,l in enumerate(labs)}
for l,r in R.items():cf[f'A{r}']=l
H=7
for y in range(0,H+1):
    c=L(y+2);cf[f'{c}3']=y
    cf[f'{c}{R["Rental income"]}']=f"=SUMPRODUCT('Lease-Up'!$B$2:$B$5,'Lease-Up'!$C$2:$C$5,('Lease-Up'!$D$2:$D$5<={c}$3)*(1+{I['growth']})^({c}$3-'Lease-Up'!$D$2:$D$5))*({c}$3<={I['hold']})"
    cf[f'{c}{R["Free rent"]}']=f"=-SUMPRODUCT('Lease-Up'!$B$2:$B$5,'Lease-Up'!$C$2:$C$5,('Lease-Up'!$D$2:$D$5={c}$3)*'Lease-Up'!$E$2:$E$5/12)"
    cf[f'{c}{R["Opex"]}']=f"=-SUM('Lease-Up'!$B$2:$B$5)*{I['opex']}*({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}{R["TI"]}']=f"=-SUMPRODUCT('Lease-Up'!$B$2:$B$5,'Lease-Up'!$F$2:$F$5,--('Lease-Up'!$D$2:$D$5={c}$3))"
    cf[f'{c}{R["Conversion"]}']=f"=-SUM('Lease-Up'!$B$2:$B$5)*{I['conv']}*IF({c}$3=0,0.6,IF({c}$3=1,0.4,0))"
    cf[f'{c}{R["Acquisition"]}']=f"=IF({c}$3=0,-{I['buy']}*(1+{I['tic']}),0)"
    nxt=L(y+3)
    cf[f'{c}{R["Sale"]}']=f"=IF({c}$3={I['hold']},SUMPRODUCT('Lease-Up'!$B$2:$B$5,'Lease-Up'!$C$2:$C$5,(1+{I['growth']})^({c}$3+1-'Lease-Up'!$D$2:$D$5))/{I['exit']}*0.98,0)"
    cf[f'{c}{R["Unlevered cash flow"]}']=f"=SUM({c}{R['Rental income']}:{c}{R['Sale']})"
    loan=f"({I['buy']}*(1+{I['tic']})+SUM('Lease-Up'!$B$2:$B$5)*{I['conv']}+SUMPRODUCT('Lease-Up'!$B$2:$B$5,'Lease-Up'!$F$2:$F$5))*{I['ltc']}"
    cf[f'{c}{R["Loan draw / (repay)"]}']=f"=IF({c}$3=0,{loan},IF({c}$3={I['hold']},-{loan},0))"
    cf[f'{c}{R["Interest"]}']=f"=-{loan}*{I['rate']}*({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}{R["Levered cash flow"]}']=f"={c}{R['Unlevered cash flow']}+{c}{R['Loan draw / (repay)']}+{c}{R['Interest']}"
summary(wb,'Returns',[('Unlevered IRR',f"=IRR('Cash Flow'!B{R['Unlevered cash flow']}:I{R['Unlevered cash flow']})",P),('Levered IRR',f"=IRR('Cash Flow'!B{R['Levered cash flow']}:I{R['Levered cash flow']})",P),
  ('Equity multiple',f"=SUMIF('Cash Flow'!B{R['Levered cash flow']}:I{R['Levered cash flow']},\">0\")/-SUMIF('Cash Flow'!B{R['Levered cash flow']}:I{R['Levered cash flow']},\"<0\")",'0.00"x"'),
  ('Total cost',f"=-SUM('Cash Flow'!B{R['TI']}:I{R['Acquisition']})",N),('Net profit',f"=SUM('Cash Flow'!B{R['Unlevered cash flow']}:I{R['Unlevered cash flow']})",N),('Yield on cost (stabilised)',f"=SUMPRODUCT('Lease-Up'!B2:B5,'Lease-Up'!C2:C5)/B6",P)])
wb.save(OUT+'lab_usd.xlsx')

# ---------- solar park, EUR ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Assumptions';ws['A1']='CAMPO SOLAR 48 MWp – PROJECT FINANCE MODEL (EUR)'
I=inputs(ws,[('mwp','Capacity (MWp)',48,N2),('yield','Specific yield (kWh/kWp/yr)',1720,N),('deg','Annual degradation',0.004,P),('ppa','PPA price (EUR/MWh)',52,N2),('ppaterm','PPA term (years)',12,'0'),
  ('merch','Merchant price after PPA (EUR/MWh)',44,N2),('capex','Capex (EUR m/MWp)',0.62,'0.000'),('opex','Opex (EUR k/MWp/yr)',13.5,N2),('opexinf','Opex indexation',0.02,P),('life','Asset life (years)',30,'0'),
  ('gear','Gearing',0.70,P),('debtrate','Debt all-in rate',0.052,P),('tenor','Debt tenor (years)',18,'0'),('tax','Corporate tax',0.25,P)])
cf=wb.create_sheet('Annual');cf['A3']='Year';labs=['Generation (MWh)','Price (EUR/MWh)','Revenue','Opex','EBITDA','Capex','Debt service','Tax','Project cash flow','Equity cash flow','DSCR']
R={l:4+i for i,l in enumerate(labs)}
for l,r in R.items():cf[f'A{r}']=l
YRS=30
last=L(YRS+2)
for y in range(0,YRS+1):
    c=L(y+2);cf[f'{c}3']=y;op=f'({c}$3>=1)*({c}$3<={I["life"]})'
    cf[f'{c}{R["Generation (MWh)"]}']=f"={I['mwp']}*{I['yield']}*(1-{I['deg']})^MAX(0,{c}$3-1)*{op}"
    cf[f'{c}{R["Price (EUR/MWh)"]}']=f"=IF({c}$3<={I['ppaterm']},{I['ppa']},{I['merch']})"
    cf[f'{c}{R["Revenue"]}']=f"={c}{R['Generation (MWh)']}*{c}{R['Price (EUR/MWh)']}"
    cf[f'{c}{R["Opex"]}']=f"=-{I['mwp']}*{I['opex']}*1000*(1+{I['opexinf']})^MAX(0,{c}$3-1)*{op}"
    cf[f'{c}{R["EBITDA"]}']=f"={c}{R['Revenue']}+{c}{R['Opex']}"
    cf[f'{c}{R["Capex"]}']=f"=IF({c}$3=0,-{I['mwp']}*{I['capex']}*1000000,0)"
    cf[f'{c}{R["Debt service"]}']=f"=IF(AND({c}$3>=1,{c}$3<={I['tenor']}),PMT({I['debtrate']},{I['tenor']},{I['mwp']}*{I['capex']}*1000000*{I['gear']}),0)"
    cf[f'{c}{R["Tax"]}']=f"=-MAX(0,{c}{R['EBITDA']}-{I['mwp']}*{I['capex']}*1000000/{I['life']}*{op})*{I['tax']}"
    cf[f'{c}{R["Project cash flow"]}']=f"={c}{R['EBITDA']}+{c}{R['Capex']}+{c}{R['Tax']}"
    cf[f'{c}{R["Equity cash flow"]}']=f"={c}{R['Project cash flow']}+{c}{R['Debt service']}+IF({c}$3=0,{I['mwp']}*{I['capex']}*1000000*{I['gear']},0)"
    cf[f'{c}{R["DSCR"]}']=f"=IF({c}{R['Debt service']}<0,{c}{R['EBITDA']}/-{c}{R['Debt service']},\"\")"
summary(wb,'Results',[('Project IRR',f"=IRR(Annual!B{R['Project cash flow']}:{last}{R['Project cash flow']})",P),('Equity IRR',f"=IRR(Annual!B{R['Equity cash flow']}:{last}{R['Equity cash flow']})",P),
  ('Minimum DSCR',f"=MIN(Annual!C{R['DSCR']}:{last}{R['DSCR']})",'0.00"x"'),('Average DSCR',f"=AVERAGE(Annual!C{R['DSCR']}:{last}{R['DSCR']})",'0.00"x"'),
  ('Total capex',f"=-Annual!B{R['Capex']}",N),('Net profit',f"=SUM(Annual!B{R['Project cash flow']}:{last}{R['Project cash flow']})",N),('LCOE proxy (EUR/MWh)',f"=(-Annual!B{R['Capex']}-SUM(Annual!C{R['Opex']}:{last}{R['Opex']}))/SUM(Annual!C{R['Generation (MWh)']}:{last}{R['Generation (MWh)']})",N2)])
wb.save(OUT+'solar_eur.xlsx')

# ---------- retirement village with DMF, NZD ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='TE AWA RETIREMENT VILLAGE – ORA / DMF MODEL (NZ$)'
I=inputs(ws,[('units','Independent living units',160,N),('ora','Occupation right price (NZ$)',780000,N),('sell','Units sold per year (first sales)',45,N),('build','Build cost per unit (NZ$)',505000,N),
  ('land','Land (NZ$)',21000000,N),('dmf','DMF (% of ORA)',0.30,P),('dmfyrs','DMF accrual period (years)',3,'0'),('tenure','Average tenure (years)',8,N2),('hpi','House price growth',0.035,P),
  ('fee','Weekly fee (NZ$)',165,N),('opexpu','Village opex per unit (NZ$/yr)',9800,N),('disc','Discount rate',0.09,P)],notes=False)
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';labs=['First sales (units)','Cumulative sold','ORA receipts (first sales)','Resales (units)','DMF on resales','Resale gain','Weekly fees','Village opex','Build cost','Land','Net cash flow']
R={l:4+i for i,l in enumerate(labs)}
for l,r in R.items():cf[f'A{r}']=l
YRS=15;last=L(YRS+2)
for y in range(0,YRS+1):
    c=L(y+2);p=L(y+1);cf[f'{c}3']=y
    cf[f'{c}{R["First sales (units)"]}']=(f"=IF({c}$3=0,0,MIN({I['sell']},{I['units']}-{p}{R['Cumulative sold']}))" if y>0 else '=0')
    cf[f'{c}{R["Cumulative sold"]}']=(f"={p}{R['Cumulative sold']}+{c}{R['First sales (units)']}" if y>0 else f"={c}{R['First sales (units)']}")
    cf[f'{c}{R["ORA receipts (first sales)"]}']=f"={c}{R['First sales (units)']}*{I['ora']}*(1+{I['hpi']})^{c}$3"
    cf[f'{c}{R["Resales (units)"]}']=(f"={p}{R['Cumulative sold']}/{I['tenure']}" if y>0 else '=0')
    cf[f'{c}{R["DMF on resales"]}']=f"={c}{R['Resales (units)']}*{I['ora']}*{I['dmf']}*MIN(1,{I['tenure']}/{I['dmfyrs']})"
    cf[f'{c}{R["Resale gain"]}']=f"={c}{R['Resales (units)']}*{I['ora']}*((1+{I['hpi']})^{c}$3-(1+{I['hpi']})^MAX(0,{c}$3-{I['tenure']}))"
    cf[f'{c}{R["Weekly fees"]}']=f"={c}{R['Cumulative sold']}*{I['fee']}*52"
    cf[f'{c}{R["Village opex"]}']=f"=-{c}{R['Cumulative sold']}*{I['opexpu']}"
    cf[f'{c}{R["Build cost"]}']=f"=-IF({c}$3<=3,{I['units']}*{I['build']}/4,0)"
    cf[f'{c}{R["Land"]}']=f"=IF({c}$3=0,-{I['land']},0)"
    cf[f'{c}{R["Net cash flow"]}']=f"=SUM({c}{R['ORA receipts (first sales)']},{c}{R['DMF on resales']}:{c}{R['Land']})"
summary(wb,'Summary',[('Project IRR',f"=IRR('Cash Flow'!B{R['Net cash flow']}:{last}{R['Net cash flow']})",P),('NPV',f"=NPV({I['disc']},'Cash Flow'!C{R['Net cash flow']}:{last}{R['Net cash flow']})+'Cash Flow'!B{R['Net cash flow']}",N),
  ('Development margin',f"=(SUM('Cash Flow'!B{R['ORA receipts (first sales)']}:{last}{R['ORA receipts (first sales)']})+SUM('Cash Flow'!B{R['Build cost']}:{last}{R['Land']}))/-SUM('Cash Flow'!B{R['Build cost']}:{last}{R['Land']})",P),
  ('Net profit',f"=SUM('Cash Flow'!B{R['Net cash flow']}:{last}{R['Net cash flow']})",N),('Total development cost',f"=-SUM('Cash Flow'!B{R['Build cost']}:{last}{R['Land']})",N),('Annual DMF at stabilisation',f"='Cash Flow'!{last}{R['DMF on resales']}",N)])
wb.save(OUT+'rv_nzd.xlsx')

# ---------- forward funding, SEK ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Deal';ws['A1']='JÖNKÖPING LOGISTIK – FORWARD FUNDING (SEK)';ws['C2']='Kommentar'
I=inputs(ws,[('gla','GLA (sqm)',42000,N,''),('erv','ERV (SEK/sqm/yr)',1150,N,'agent view 1 150'),('rf','Rent free (months)',6,'0',''),('ny','Purchaser net initial yield',0.0525,P,'fund bid'),
  ('pc','Purchaser costs',0.045,P,'stamp duty 4.25 + fees'),('bc','Build cost (SEK/sqm)',9400,N,''),('land','Land (SEK)',38000000,N,''),('cont','Contingency',0.05,P,''),('coupon','Coupon on funded costs',0.065,P,''),
  ('prog','Programme (months)',16,'0',''),('fees','Professional fees',0.08,P,'')],notes=True)
s=wb.create_sheet('Appraisal');rows=[('Contracted rent (SEK/yr)',f"={I['gla']}*{I['erv']}",N),('Gross value',f"=B3/{I['ny']}",N),('Less purchaser costs',f"=-B4*{I['pc']}/(1+{I['pc']})",N),('Less rent-free top-up',f"=-B3*{I['rf']}/12",N),
  ('Net value at practical completion','=B4+B5+B6',N),('Build cost',f"={I['gla']}*{I['bc']}",N),('Contingency',f"=B8*{I['cont']}",N),('Professional fees',f"=B8*{I['fees']}",N),('Land','='+I['land'],N),
  ('Coupon (funded costs)',f"=({I['land']}+(B8+B9+B10)*0.5)*{I['coupon']}*{I['prog']}/12",N),('Total funded cost','=SUM(B8:B12)',N),('Developer profit','=B7-B13',N),('Profit on cost','=B14/B13',P),('Fund yield on total cost','=B3/(B13+B14)',P)]
for i,(lab,f,fm) in enumerate(rows):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'ffund_sek.xlsx')

# ---------- hospital PPP, KWD ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='JAHRA HOSPITAL PPP – AVAILABILITY PAYMENT MODEL (KWD)'
I=inputs(ws,[('ap','Annual availability payment (KWD)',21500000,N),('idx','Indexation of the unitary charge',0.02,P),('ded','Performance deductions (% of payment)',0.015,P),('capex','Construction cost (KWD)',148000000,N),
  ('build','Construction period (years)',3,'0'),('ops','Operating period (years)',25,'0'),('fm','Hard FM cost (KWD/yr)',3100000,N),('fminf','FM cost inflation',0.025,P),('lc','Lifecycle (% of capex p.a.)',0.012,'0.00%'),
  ('gear','Senior debt gearing',0.85,P),('rate','Senior debt rate',0.058,P),('tenor','Debt tenor after completion (years)',22,'0')])
cf=wb.create_sheet('Model');cf['A3']='Year';labs=['Unitary charge','Deductions','FM costs','Lifecycle','Construction','Debt drawdown','Debt service','Equity cash flow','Project cash flow','CFADS','DSCR']
R={l:4+i for i,l in enumerate(labs)}
for l,r in R.items():cf[f'A{r}']=l
YRS=28;last=L(YRS+2)
for y in range(0,YRS+1):
    c=L(y+2);cf[f'{c}3']=y;op=f"({c}$3>{I['build']})*({c}$3<={I['build']}+{I['ops']})"
    cf[f'{c}{R["Unitary charge"]}']=f"={I['ap']}*(1+{I['idx']})^MAX(0,{c}$3-{I['build']}-1)*{op}"
    cf[f'{c}{R["Deductions"]}']=f"=-{c}{R['Unitary charge']}*{I['ded']}"
    cf[f'{c}{R["FM costs"]}']=f"=-{I['fm']}*(1+{I['fminf']})^MAX(0,{c}$3-{I['build']}-1)*{op}"
    cf[f'{c}{R["Lifecycle"]}']=f"=-{I['capex']}*{I['lc']}*{op}"
    cf[f'{c}{R["Construction"]}']=f"=-IF({c}$3<{I['build']},{I['capex']}/{I['build']},0)"
    cf[f'{c}{R["Debt drawdown"]}']=f"=-{c}{R['Construction']}*{I['gear']}"
    cf[f'{c}{R["Debt service"]}']=f"=IF(AND({c}$3>{I['build']},{c}$3<={I['build']}+{I['tenor']}),PMT({I['rate']},{I['tenor']},{I['capex']}*{I['gear']}),0)"
    cf[f'{c}{R["Project cash flow"]}']=f"=SUM({c}{R['Unitary charge']}:{c}{R['Construction']})"
    cf[f'{c}{R["Equity cash flow"]}']=f"={c}{R['Project cash flow']}+{c}{R['Debt drawdown']}+{c}{R['Debt service']}"
    cf[f'{c}{R["CFADS"]}']=f"=SUM({c}{R['Unitary charge']}:{c}{R['Lifecycle']})"
    cf[f'{c}{R["DSCR"]}']=f"=IF({c}{R['Debt service']}<0,{c}{R['CFADS']}/-{c}{R['Debt service']},\"\")"
summary(wb,'Outputs',[('Equity IRR',f"=IRR(Model!B{R['Equity cash flow']}:{last}{R['Equity cash flow']})",P),('Project IRR',f"=IRR(Model!B{R['Project cash flow']}:{last}{R['Project cash flow']})",P),
  ('Minimum DSCR',f"=MIN(Model!B{R['DSCR']}:{last}{R['DSCR']})",'0.00"x"'),('Average DSCR',f"=AVERAGE(Model!B{R['DSCR']}:{last}{R['DSCR']})",'0.00"x"'),('Equity invested',f"=-SUMIF(Model!B{R['Equity cash flow']}:{last}{R['Equity cash flow']},\"<0\")",N),
  ('Net profit',f"=SUM(Model!B{R['Project cash flow']}:{last}{R['Project cash flow']})",N)])
wb.save(OUT+'ppp_kwd.xlsx')
print('ok')

# round 10: a condo with a unit-mix table priced through INDEX/MATCH; a ground lease (lessor) with 5-yearly reviews, CPI and NPV (QAR);
# a phased master plan (one row per phase) built with SUMPRODUCT windows (AED); a planning-risk conversion valued on probability-weighted
# outcomes (GBP); a stabilised Swiss asset refinanced on SARON + margin in basis points (CHF), with notes columns holding numbers
import openpyxl
from openpyxl.utils import get_column_letter as L
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m10/'
P='0.00%';N='#,##0'
# ---------- U. condo, USD, unit mix + price list lookup ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Unit Mix';ws['A1']='HARBOR LIGHTS CONDOMINIUMS – FOR-SALE (USD)'
ws.append([]);ws.append(['Unit type','Units','Avg size (sf)','Price list key'])
for r in [('Studio',40,520,'S'),('1BR',90,760,'1B'),('2BR',70,1120,'2B'),('3BR',20,1540,'3B')]:ws.append(list(r))
pl=wb.create_sheet('Price List');pl.append(['Key','Price psf']);[pl.append(list(r)) for r in [('S',1250),('1B',1180),('2B',1100),('3B',1060)]]
a=wb.create_sheet('Assumptions');I={};row=2
for k,lab,v,f in [('land','Land',38000000,N),('hard','Hard cost per gsf',465,N),('eff','Efficiency (sellable / gross)',0.82,P),('soft','Soft costs (% of hard)',0.18,P),('dep','Presale deposits',0.10,P),('pre','Presold before construction',0.55,P),('com','Sales commission',0.035,P),('rate','Construction loan rate',0.08,P),('ltc','Loan to cost',0.6,P),('months','Build period (months)',30,'0')]:
    a.cell(row,1,lab);c=a.cell(row,2,v);c.number_format=f;I[k]=f'Assumptions!$B${row}';row+=1
s=wb.create_sheet('Pro Forma')
items=[('Sellable area (sf)',"=SUMPRODUCT('Unit Mix'!B4:B7,'Unit Mix'!C4:C7)",N),
 ('Gross sales',"=SUMPRODUCT('Unit Mix'!B4:B7,'Unit Mix'!C4:C7,INDEX('Price List'!B2:B5,MATCH('Unit Mix'!D4,'Price List'!A2:A5,0))*0+1*(IF('Unit Mix'!D4:D7=\"S\",'Price List'!B2,0)+IF('Unit Mix'!D4:D7=\"1B\",'Price List'!B3,0)+IF('Unit Mix'!D4:D7=\"2B\",'Price List'!B4,0)+IF('Unit Mix'!D4:D7=\"3B\",'Price List'!B5,0)))",N),
 ('Gross building area (gsf)',f"=B3/{I['eff']}",N),('Hard costs',f"=B5*{I['hard']}",N),('Soft costs',f"=B6*{I['soft']}",N),('Commissions',f"=B4*{I['com']}",N),
 ('Interest',f"=(B6+B7)*{I['ltc']}*{I['rate']}*{I['months']}/12*0.5*(1-{I['pre']}*{I['dep']})",N),('Total development cost',f"={I['land']}+B6+B7+B8+B9",N),('Net profit','=B4-B10',N),('Profit on cost','=B11/B10',P),('Margin on GDV','=B11/B4',P),
 ('Deposits held at start',f"=B4*{I['pre']}*{I['dep']}",N),('Unlevered IRR (approx.)',f"=(B4/B10)^(12/({I['months']}+6))-1",P)]
for i,(lab,f,fm) in enumerate(items):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'condo_usd.xlsx')
# ---------- V. ground lease, lessor, QAR ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Lease';ws['A1']='LUSAIL PLOT 14 – GROUND LEASE (LESSOR) – QAR'
I={};row=3
for k,lab,v,f,note in [('rent','Initial ground rent (QAR p.a.)',6200000,N,'per lease schedule'),('cpi','CPI assumption',0.025,P,'IMF 2025 outlook 2.5'),('rev','Review every (years)',5,'0','clause 7.2'),('uplift','Fixed uplift at review',0.10,P,'or CPI, whichever higher'),
   ('term','Term (years)',30,'0',''),('disc','Discount rate',0.075,P,'board WACC 7.5'),('land','Land value today (QAR)',68000000,N,'valuer 2026')]:
    ws.cell(row,1,lab);c=ws.cell(row,2,v);c.number_format=f;ws.cell(row,4,note);I[k]=f'Lease!$B${row}';row+=1
cf=wb.create_sheet('Rent Schedule');cf['A3']='Year';cf['A4']='Rent';cf['A5']='Cash flow'
for y in range(0,31):
    c=L(y+2);cf[f'{c}3']=y
    if y==0:cf[f'{c}4']=0;cf[f'{c}5']=f"=-{I['land']}"
    else:
        prev=L(y+1)
        cf[f'{c}4']=f"=IF({c}3>{I['term']},0,IF({c}3=1,{I['rent']},IF(MOD({c}3-1,{I['rev']})=0,{prev}4*MAX(1+{I['uplift']},(1+{I['cpi']})^{I['rev']}),{prev}4)))"
        cf[f'{c}5']=f'={c}4'
s=wb.create_sheet('Valuation')
for i,(lab,f,fm) in enumerate([('NPV of rent',f"=NPV({I['disc']},'Rent Schedule'!C4:AF4)",N),('Lessor IRR',"=IRR('Rent Schedule'!B5:AF5)",P),('Initial yield on land',f"={I['rent']}/{I['land']}",P),('Total rent over term',"=SUM('Rent Schedule'!C4:AF4)",N),('Net profit',f"=B3-{I['land']}",N)]):
    s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'groundlease_qar.xlsx')
# ---------- W. phased master plan, AED, one row per phase, SUMPRODUCT windows ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Phasing';ws['A1']='AL REEM MASTER PLAN – PHASED DEVELOPMENT (AED)'
ws.append([]);ws.append(['Phase','Sellable area (sqm)','Start year','Build years','Sale price (AED/sqm)','Build cost (AED/sqm)','Include (1/0)'])
for r in [('Phase 1',85000,1,3,16500,10400,1),('Phase 2',110000,3,3,17200,10800,1),('Phase 3',95000,6,3,18000,11200,1)]:ws.append(list(r))
a=wb.create_sheet('Assumptions');a['A2']='Infrastructure & land (AED)';a['B2']=420000000;a['A3']='Sales collected in year after completion';a['B3']=0.7;a['A4']='Discount rate';a['B4']=0.10;a['B3'].number_format=P;a['B4'].number_format=P
cf=wb.create_sheet('Cash Flow');cf['A3']='Year'
for y in range(0,12):
    c=L(y+2);cf[f'{c}3']=y
    cf[f'{c}4']=f"=-SUMPRODUCT(Phasing!$G$4:$G$6,Phasing!$B$4:$B$6,Phasing!$F$4:$F$6,(Phasing!$C$4:$C$6<={c}$3)*(Phasing!$C$4:$C$6+Phasing!$D$4:$D$6>{c}$3)/Phasing!$D$4:$D$6)"
    cf[f'{c}5']=f"=SUMPRODUCT(Phasing!$G$4:$G$6,Phasing!$B$4:$B$6,Phasing!$E$4:$E$6,(Phasing!$C$4:$C$6+Phasing!$D$4:$D$6={c}$3)*Assumptions!$B$3+(Phasing!$C$4:$C$6+Phasing!$D$4:$D$6+1={c}$3)*(1-Assumptions!$B$3))"
    cf[f'{c}6']=f"=IF({c}$3=0,-Assumptions!$B$2,0)";cf[f'{c}7']=f"=SUM({c}4:{c}6)"
cf['A4']='Construction';cf['A5']='Sales';cf['A6']='Land & infrastructure';cf['A7']='Net cash flow'
s=wb.create_sheet('Summary')
for i,(lab,f,fm) in enumerate([('Project IRR',"=IRR('Cash Flow'!B7:M7)",P),('NPV @ discount rate',"=NPV(Assumptions!B4,'Cash Flow'!C7:M7)+'Cash Flow'!B7",N),('Net profit',"=SUM('Cash Flow'!B7:M7)",N),('Gross development value',"=SUM('Cash Flow'!B5:M5)",N),('Total development cost',"=-SUM('Cash Flow'!B4:M4)-SUM('Cash Flow'!B6:M6)",N),('Profit on cost','=B5/B7',P)]):
    s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'masterplan_aed.xlsx')
# ---------- X. planning-risk conversion, GBP, probability-weighted ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='OLD MILL – OFFICE TO RESIDENTIAL CONVERSION (GBP)'
I={};row=3
for k,lab,v,f in [('buy','Purchase price',14500000,N),('prob','Probability of planning consent',0.65,P),('units','Flats with consent',96,N),('price','Average flat price',395000,N),('conv','Conversion cost per flat',148000,N),('fallback','Sale value without consent (office)',13200000,N),('months','Programme with consent (months)',26,'0'),('fees','Planning & professional fees',850000,N)]:
    ws.cell(row,1,lab);c=ws.cell(row,2,v);c.number_format=f;I[k]=f'Inputs!$B${row}';row+=1
s=wb.create_sheet('Outcomes');s.append(['','Consent','No consent','Probability-weighted'])
rows=[('Revenue',f"={I['units']}*{I['price']}",f"={I['fallback']}"),('Costs',f"={I['buy']}+{I['fees']}+{I['units']}*{I['conv']}",f"={I['buy']}+{I['fees']}"),('Profit','=B2-B3','=C2-C3'),('Profit on cost','=B4/B3','=C4/C3'),('Annualised return',f"=(1+B5)^(12/{I['months']})-1",'=C5')]
for i,(lab,b,c_) in enumerate(rows):
    r=2+i;s.cell(r,1,lab);s.cell(r,2,b);s.cell(r,3,c_);s.cell(r,4,f"={I['prob']}*B{r}+(1-{I['prob']})*C{r}")
    for col in 'BCD':s[f'{col}{r}'].number_format=P if lab in ('Profit on cost','Annualised return') else N
sm=wb.create_sheet('Summary')
for i,(lab,f,fm) in enumerate([('Expected net profit','=Outcomes!D4',N),('Expected profit on cost','=Outcomes!D5',P),('Expected IRR','=Outcomes!D6',P),('Profit if consent','=Outcomes!B4',N),('Loss if refused','=Outcomes!C4',N)]):
    sm.cell(3+i,1,lab);c=sm.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'conversion_gbp.xlsx')
# ---------- Y. Swiss refinancing, CHF, SARON + margin in bps ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Assumptions';ws['A1']='ZÜRICH NORD LOGISTICS – REFINANCING (CHF)';ws['C2']='Source / note'
I={};row=3
for k,lab,v,f,note in [('noi','Net operating income (CHF p.a.)',9400000,N,'2025 actual 9,260,000'),('val','Valuation (CHF)',212000000,N,'Wüest 2026'),('ltv','Target LTV',0.55,P,''),('saron','SARON',0.0075,P,'SNB, 0.75'),('margin','Credit margin (bps)',165,'0','term sheet 165'),
   ('swap','Swap cost (bps)',35,'0',''),('amort','Amortisation (% p.a.)',0.01,P,''),('ng','NOI growth',0.015,P,''),('ey','Exit yield',0.0425,P,''),('hold','Hold (years)',7,'0','')]:
    ws.cell(row,1,lab);c=ws.cell(row,2,v);c.number_format=f;ws.cell(row,3,note);I[k]=f'Assumptions!$B${row}';row+=1
cf=wb.create_sheet('Debt');cf['A3']='Year';rr=['NOI','Loan balance','Interest','Amortisation','Debt service','DSCR','ICR','Equity cash flow']
R={l:4+i for i,l in enumerate(rr)}
for l,r_ in R.items():cf[f'A{r_}']=l
allin=f"({I['saron']}+({I['margin']}+{I['swap']})/10000)"
for y in range(0,9):
    c=L(y+2);p=L(y+1);cf[f'{c}3']=y;g=lambda l:f'{c}{R[l]}'
    cf[g('NOI')]=f"=IF(AND({c}$3>=1,{c}$3<={I['hold']}),{I['noi']}*(1+{I['ng']})^({c}$3-1),0)"
    cf[g('Loan balance')]=f"={I['val']}*{I['ltv']}" if y==0 else f"=IF({c}$3>{I['hold']},0,{p}{R['Loan balance']}-{g('Amortisation')})"
    cf[g('Interest')]='=0' if y==0 else f"=IF({c}$3<={I['hold']},{p}{R['Loan balance']}*{allin},0)"
    cf[g('Amortisation')]='=0' if y==0 else f"=IF({c}$3<={I['hold']},{I['val']}*{I['ltv']}*{I['amort']},0)"
    cf[g('Debt service')]=f"={g('Interest')}+{g('Amortisation')}"
    cf[g('DSCR')]=f'=IF({g("Debt service")}>0,{g("NOI")}/{g("Debt service")},"")';cf[g('ICR')]=f'=IF({g("Interest")}>0,{g("NOI")}/{g("Interest")},"")'
    cf[g('Equity cash flow')]=(f"=-{I['val']}*(1-{I['ltv']})" if y==0 else f"=IF({c}$3<={I['hold']},{g('NOI')}-{g('Debt service')},0)+IF({c}$3={I['hold']},{g('NOI')}*(1+{I['ng']})/{I['ey']}-{g('Loan balance')},0)")
s=wb.create_sheet('KPIs');rg=lambda l:f'Debt!$B${R[l]}:$J${R[l]}'
for i,(lab,f,fm) in enumerate([('Levered IRR',f'=IRR({rg("Equity cash flow")})',P),('Minimum DSCR',f'=MIN({rg("DSCR")})','0.00"x"'),('Minimum ICR',f'=MIN({rg("ICR")})','0.00"x"'),('All-in interest rate',f'={allin}',P),('Equity multiple',f'=SUMIF({rg("Equity cash flow")},">0")/-SUMIF({rg("Equity cash flow")},"<0")','0.00"x"'),('Net profit',f'=SUM({rg("Equity cash flow")})',N)]):
    s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'refi_chf.xlsx')
print('ok')

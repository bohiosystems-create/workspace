# round 26: a CIO's desk on new ground again
#  storage  - USD self-storage, monthly 10 years: lease-up on an S-curve (EXP), existing-customer rate increases, scenarios kept on
#             their own sheets ("Base", "Downside") and picked by INDIRECT(Inputs!B3&"!B4")
#  riyadh   - SAR residential for sale and lease with Arabic sheet names and bilingual labels, finance at SAIBOR + a margin in bps,
#             an exit date typed as a date and the hold found by MATCH on the timeline
#  fx       - a EUR office held by a USD fund: an FX rate input, a hedge cost, results in EUR and in USD side by side
#  care     - GBP senior housing: defined names for every input, an array constant for the care-mix weights, CEILING and ROUNDUP
#             for staffing, FLOOR for the rent review
#  breaker  - AED development with a circular construction loan and a circuit breaker (a 0/1 switch) that cuts the loop
import openpyxl,os,datetime
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.workbook.properties import CalcProperties
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m26/'
os.makedirs(OUT,exist_ok=True)
P='0.00%';N='#,##0';X='0.00"x"';D='dd-mmm-yyyy'
def ref(ws,col,r):return (f"'{ws.title}'" if not ws.title.isascii() or ' ' in ws.title else ws.title)+f"!${L(col)}${r}"
def inputs(ws,rows,col=2,start=3):
    I={};r=start
    for k,lab,v,f in rows:
        ws.cell(r,1,lab);c=ws.cell(r,col,v);c.number_format=f;I[k]=ref(ws,col,r);r+=1
    return I
def table(ws,rows,start=3,col=2):
    for i,(lab,f,fm) in enumerate(rows):ws.cell(start+i,1,lab);c=ws.cell(start+i,col,f);c.number_format=fm
def timeline(ws,labels,T,fill,first_row=3):
    R={l:first_row+i for i,l in enumerate(labels)}
    for l,r in R.items():ws.cell(r,1,l)
    for t in range(T+1):
        c=L(t+2);p=L(t+1)
        for l,f in fill(t,c,p,R).items():ws[f'{c}{R[l]}']=f if not isinstance(f,str) or f.startswith('=') else '='+f
    return R

# ================= 26A self-storage, scenarios on their own sheets via INDIRECT =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='HARBORVIEW SELF STORAGE – LEASE-UP, MONTHLY (USD)'
I=inputs(ws,[('scen','Scenario sheet','Base','@'),('units','Units',820,N),('nrsf','Rentable sq ft',71500,N),('price','Purchase price (USD)',14800000,N),('exit','Exit cap rate',0.0575,P),('opex','Operating cost share of revenue',0.36,P)])
for nm,rate,stab,speed,ecri in [('Base',1.62,0.91,0.22,0.08),('Downside',1.48,0.85,0.15,0.05)]:
    sh=wb.create_sheet(nm);sh['A1']=f'{nm} case'
    for r,(lab,v,f) in enumerate([('Street rate per sq ft a month (USD)',rate,'0.00'),('Stabilised occupancy',stab,P),('Lease-up speed',speed,'0.00'),('Existing-customer rate increase',ecri,P)],3):sh.cell(r,1,lab);c=sh.cell(r,2,v);c.number_format=f
cf=wb.create_sheet('Cash Flow');T=120
sv=lambda r:f"INDIRECT({I['scen']}&\"!B{r}\")"
labs=['Month','Occupancy','Street rate','In-place rate','Revenue','Operating costs','NOI','Cash flow']
def sf(t,c,p,R):
    m=f"{c}$3";first=t==0
    d={'Month':t,'Occupancy':'0' if first else f"{sv(4)}/(1+EXP(-{sv(5)}*({m}-18)))",
       'Street rate':f"{sv(3)}*(1+0.03)^INT({m}/12)",
       'In-place rate':f"{c}{R['Street rate']}" if first else f"MAX({c}{R['Street rate']},{p}{R['In-place rate']}*IF(MOD({m},12)=0,1+{sv(6)},1))"}
    d['Revenue']=f"{I['nrsf']}*{c}{R['Occupancy']}*{c}{R['In-place rate']}"
    d['Operating costs']=f"{c}{R['Revenue']}*{I['opex']}+IF({m}>0,{I['units']}*2.5,0)"
    d['NOI']=f"{c}{R['Revenue']}-{c}{R['Operating costs']}"
    d['Cash flow']=f"-{I['price']}" if first else f"{c}{R['NOI']}+IF({m}={T},SUM({L(max(2,t-9))}{R['NOI']}:{c}{R['NOI']})/{I['exit']},0)"
    return d
R=timeline(cf,labs,T,sf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Unlevered IRR',f"=(1+IRR({row('Cash flow')},0.01))^12-1",P),('Stabilised NOI, year 5 (USD)',f"=SUM('Cash Flow'!$AY${R['NOI']}:$BJ${R['NOI']})",N),
 ('Occupancy at month 24',f"='Cash Flow'!$AA${R['Occupancy']}",P),('Months to 85% occupancy',f"=IFERROR(MATCH(TRUE,INDEX('Cash Flow'!$B${R['Occupancy']}:${E}${R['Occupancy']}>=0.85,0),0)-1,\"not reached\")",'0'),('Net profit (USD)',f"=SUM({row('Cash flow')})",N)])
wb.save(OUT+'storage_usd.xlsx')

# ================= 26B Riyadh, Arabic sheet names, margin in bps, exit date by MATCH =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='المدخلات';ws['A1']='مشروع النخيل السكني – AL NAKHEEL RESIDENTIAL, RIYADH (SAR)'
I=inputs(ws,[('start','تاريخ البدء / Start date',datetime.date(2026,12,31),D),('units','عدد الوحدات / Units',640,N),('price','سعر البيع للوحدة / Sale price per unit (SAR)',1150000,N),('sold','حصة البيع / Share of units sold',0.6,P),
 ('rent','الإيجار السنوي للوحدة / Rent per unit a year (SAR)',62000,N),('build','تكلفة البناء / Build cost (SAR)',420000000,N),('land','الأرض / Land (SAR)',165000000,N),('saibor','سايبور / SAIBOR',0.0545,P),
 ('margin','الهامش (نقطة أساس) / Margin (bps)',275,'0'),('ltc','نسبة التمويل / Loan to cost',0.5,P),('exitd','تاريخ التخارج / Exit date',datetime.date(2032,12,31),D),('xy','عائد التخارج / Exit yield',0.07,P)])
cf=wb.create_sheet('التدفقات النقدية');T=10
labs=['Year','Date','Build','Land','Sales','Rent','Debt','Interest','Exit','Cash flow']
def rf(t,c,p,R):
    y=f"{c}$3";first=t==0;dt=f"{c}{R['Date']}"
    d={'Year':t,'Date':f"EDATE({I['start']},12*{y})",'Build':f"IF(AND({y}>=1,{y}<=3),{I['build']}/3,0)",'Land':f"IF({y}=0,{I['land']},0)",
       'Sales':f"IF(AND({y}>=2,{y}<=4),{I['units']}*{I['sold']}*{I['price']}/3,0)",'Rent':f"IF(AND({y}>=4,{dt}<={I['exitd']}),{I['units']}*(1-{I['sold']})*{I['rent']}*1.025^({y}-4),0)",
       'Debt':f"({I['build']}+{I['land']})*{I['ltc']}",'Interest':'0' if first else f"IF({y}<=4,{c}{R['Debt']}*({I['saibor']}+{I['margin']}/10000),0)",
       'Exit':f"IF({y}=MATCH({I['exitd']},$B${R['Date']}:${L(T+2)}${R['Date']},0)-1,{c}{R['Rent']}*1.025/{I['xy']},0)"}
    d['Cash flow']=f"-{c}{R['Build']}-{c}{R['Land']}+{c}{R['Sales']}+{c}{R['Rent']}-{c}{R['Interest']}+{c}{R['Exit']}+IF({y}=0,{c}{R['Debt']},0)-IF({y}=4,{c}{R['Debt']},0)"
    return d
R=timeline(cf,labs,T,rf);E=L(T+2);row=lambda n:f"'التدفقات النقدية'!$B${R[n]}:${E}${R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
table(wb.create_sheet('النتائج'),[('العائد الداخلي / Levered IRR',f"=IRR({row('Cash flow')})",P),('صافي الربح / Net profit (SAR)',f"=SUM({row('Cash flow')})",N),
 ('تكلفة التمويل / Finance rate',f"={I['saibor']}+{I['margin']}/10000",P),('سنة التخارج / Exit year',f"=MATCH({I['exitd']},'التدفقات النقدية'!$B${R['Date']}:${E}${R['Date']},0)-1",'0'),('قيمة التخارج / Exit value (SAR)',f"=SUM({row('Exit')})",N)])
wb.save(OUT+'riyadh_sar.xlsx')

# ================= 26C EUR office held by a USD fund =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='TOUR LUMIÈRE – PARIS OFFICE IN A USD FUND (EUR / USD)'
I=inputs(ws,[('price','Purchase price (EUR)',212000000,N),('rent','Rent a year (EUR)',11800000,N),('idx','Indexation',0.021,P),('void','Void at lease break (months)',9,'0'),('brk','Lease break in year',4,'0'),
 ('xy','Exit yield',0.0475,P),('fx0','EURUSD today',1.085,'0.0000'),('fxx','EURUSD at exit',1.12,'0.0000'),('hedge','Hedge cost a year',0.0115,P),('ltv','LTV',0.45,P),('rate','Loan rate',0.039,P)])
cf=wb.create_sheet('Cash Flow');T=7
labs=['Year','Rent','Interest','Exit','Loan','Cash flow (EUR)','FX rate','Hedge cost (USD)','Cash flow (USD)']
def xf(t,c,p,R):
    y=f"{c}$3";first=t==0
    d={'Year':t,'Rent':'0' if first else f"{I['rent']}*(1+{I['idx']})^({y}-1)*IF({y}={I['brk']}+1,1-{I['void']}/12,1)",'Interest':'0' if first else f"{I['price']}*{I['ltv']}*{I['rate']}",
       'Exit':f"IF({y}={T},{c}{R['Rent']}*(1+{I['idx']})/{I['xy']},0)",'Loan':f"IF({y}=0,{I['price']}*{I['ltv']},IF({y}={T},-{I['price']}*{I['ltv']},0))"}
    d['Cash flow (EUR)']=f"-{I['price']}+{c}{R['Loan']}" if first else f"{c}{R['Rent']}-{c}{R['Interest']}+{c}{R['Exit']}+{c}{R['Loan']}"
    d['FX rate']=f"{I['fx0']}+({I['fxx']}-{I['fx0']})*{y}/{T}"
    d['Hedge cost (USD)']='0' if first else f"{I['price']}*(1-{I['ltv']})*{I['hedge']}*{c}{R['FX rate']}"
    d['Cash flow (USD)']=f"{c}{R['Cash flow (EUR)']}*{c}{R['FX rate']}-{c}{R['Hedge cost (USD)']}"
    return d
R=timeline(cf,labs,T,xf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Levered IRR (EUR)',f"=IRR({row('Cash flow (EUR)')})",P),('Levered IRR (USD)',f"=IRR({row('Cash flow (USD)')})",P),('Net profit (EUR)',f"=SUM({row('Cash flow (EUR)')})",N),
 ('Net profit (USD)',f"=SUM({row('Cash flow (USD)')})",N),('FX gain or loss (USD)',f"=B6-B5*{I['fx0']}",N),('Hedge cost over the hold (USD)',f"=SUM({row('Hedge cost (USD)')})",N)])
wb.save(OUT+'fx_eurusd.xlsx')

# ================= 26D senior housing with defined names and an array constant =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Assumptions';ws['A1']='BIRCHWOOD GRANGE – SENIOR LIVING (GBP)'
rows=[('Beds','Beds',120,N),('Fee_Residential','Weekly fee, residential (£)',1250,N),('Fee_Nursing','Weekly fee, nursing (£)',1480,N),('Fee_Dementia','Weekly fee, dementia (£)',1560,N),
      ('Occupancy','Occupancy',0.92,P),('Staff_Ratio','Residents per carer',4.5,'0.0'),('Carer_Cost','Carer cost a year (£)',31500,N),('Other_Costs','Other costs share of fees',0.28,P),
      ('Price','Purchase price (£)',38500000,N),('Exit_Yield','Exit yield',0.0625,P),('Review','Fee review a year',0.035,P)]
for r,(nm,lab,v,f) in enumerate(rows,3):
    ws.cell(r,1,lab);c=ws.cell(r,2,v);c.number_format=f;wb.defined_names[nm]=DefinedName(nm,attr_text=f"Assumptions!$B${r}")
cf=wb.create_sheet('Cash Flow');T=8
labs=['Year','Residents','Blended weekly fee','Fees','Carers','Staff costs','Other costs','EBITDAR','Cash flow']
def cf_(t,c,p,R):
    y=f"{c}$3";first=t==0
    d={'Year':t,'Residents':'0' if first else "ROUNDDOWN(Beds*Occupancy,0)",
       'Blended weekly fee':'0' if first else f"FLOOR(SUMPRODUCT({{0.45,0.35,0.2}},CHOOSE({{1,2,3}},Fee_Residential,Fee_Nursing,Fee_Dementia))*(1+Review)^({y}-1),5)",
       'Fees':f"{c}{R['Residents']}*{c}{R['Blended weekly fee']}*52",'Carers':'0' if first else f"CEILING({c}{R['Residents']}/Staff_Ratio,1)*4.2",
       'Staff costs':f"ROUNDUP({c}{R['Carers']},0)*Carer_Cost*(1+Review)^MAX(0,{y}-1)",'Other costs':f"{c}{R['Fees']}*Other_Costs"}
    d['EBITDAR']=f"{c}{R['Fees']}-{c}{R['Staff costs']}-{c}{R['Other costs']}"
    d['Cash flow']="-Price" if first else f"{c}{R['EBITDAR']}+IF({y}={T},{c}{R['EBITDAR']}*(1+Review)/Exit_Yield,0)"
    return d
R=timeline(cf,labs,T,cf_);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Unlevered IRR',f"=IRR({row('Cash flow')})",P),('EBITDAR margin, year 1',f"='Cash Flow'!C{R['EBITDAR']}/'Cash Flow'!C{R['Fees']}",P),('Carers on the rota',f"='Cash Flow'!C{R['Carers']}",'0.0'),
 ('Blended weekly fee, year 1 (£)',f"='Cash Flow'!C{R['Blended weekly fee']}",N),('Net profit (£)',f"=SUM({row('Cash flow')})",N)])
wb.save(OUT+'care_gbp.xlsx')

# ================= 26E circular construction loan with a circuit breaker =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='CREEK VISTA TOWER – DEVELOPMENT WITH A CIRCUIT BREAKER (AED)'
I=inputs(ws,[('cb','Circuit breaker (1 = interest on, 0 = off)',1,'0'),('land','Land (AED)',95000000,N),('build','Build cost (AED)',310000000,N),('q','Build (quarters)',10,'0'),('ltc','Loan to cost',0.6,P),
 ('rate','Interest rate',0.071,P),('gdv','Sales (AED)',560000000,N),('sell','Sales period (quarters)',6,'0')])
cf=wb.create_sheet('Cash Flow');T=18
labs=['Quarter','Build','Land','Interest','Total cost','Loan drawn','Loan balance','Sales','Repayment','Equity cash flow']
def bf(t,c,p,R):
    q=f"{c}$3";first=t==0;Q=I['q'];prev='0' if first else f"{p}{R['Loan balance']}"
    d={'Quarter':t,'Build':f"IF(AND({q}>=1,{q}<={Q}),{I['build']}/{Q},0)",'Land':f"IF({q}=0,{I['land']},0)",
       'Interest':'0' if first else f"IF({I['cb']}=1,IFERROR(({prev}+{c}{R['Loan drawn']}/2)*{I['rate']}/4,0),0)",
       'Total cost':f"{c}{R['Build']}+{c}{R['Land']}+{c}{R['Interest']}",'Loan drawn':f"IF({q}<={Q},{c}{R['Total cost']}*{I['ltc']},0)",
       'Sales':f"IF(AND({q}>{Q},{q}<={Q}+{I['sell']}),{I['gdv']}/{I['sell']},0)",'Repayment':f"MIN({prev}+{c}{R['Loan drawn']},{c}{R['Sales']})",
       'Loan balance':f"{prev}+{c}{R['Loan drawn']}-{c}{R['Repayment']}",
       'Equity cash flow':f"{c}{R['Sales']}-{c}{R['Repayment']}-({c}{R['Total cost']}-{c}{R['Loan drawn']})"}
    return d
R=timeline(cf,labs,T,bf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Levered IRR',f"=(1+IRR({row('Equity cash flow')},0.03))^4-1",P),('Peak debt (AED)',f"=MAX({row('Loan balance')})",N),('Interest capitalised (AED)',f"=SUM({row('Interest')})",N),
 ('Total cost (AED)',f"=SUM({row('Total cost')})",N),('Net profit (AED)',f"=SUM({row('Equity cash flow')})",N),('Profit on cost',"=B7/B6",P)])
wb.calculation=CalcProperties(iterate=True,iterateCount=200,iterateDelta=1e-9,fullCalcOnLoad=True)
wb.save(OUT+'breaker_aed.xlsx')
print('ok')

# round 12: five more model types
#  tower  - Riyadh mixed-use tower, SAR, MONTHLY cash flow on real dates, XIRR / XNPV, EDATE start
#  option - UK land option agreement, GBP, staged option fees, planning probability, landowner/promoter split, MAX/MIN collars
#  flex   - flex office (co-working), EUR, membership desks with churn and a ramp, OFFSET-free but INDEX-driven price tiers
#  park   - multi-storey car park, AED, hourly/season tariffs, occupancy by weekday/weekend, CHOOSE for the tariff band
#  towns  - townhouse build-to-sell, CAD, sales pace driven by OFFSET over a release schedule, IFERROR guards
import openpyxl,datetime,os
from openpyxl.utils import get_column_letter as L
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m12/';os.makedirs(OUT+'calc',exist_ok=True)
P='0.00%';N='#,##0';N2='#,##0.00';D='dd-mmm-yy'
def inputs(ws,rows,col=2,start=3):
    I={};r=start
    for k,lab,v,f in rows:
        ws.cell(r,1,lab);c=ws.cell(r,col,v);c.number_format=f
        I[k]=(f"'{ws.title}'" if ' ' in ws.title else ws.title)+f"!${L(col)}${r}";r+=1
    return I
def summary(wb,name,rows):
    s=wb.create_sheet(name)
    for i,(lab,f,fm) in enumerate(rows):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm

# ---------- tower, SAR, monthly XIRR ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='KAFD TOWER 7 – MIXED-USE DEVELOPMENT (SAR) – MONTHLY'
I=inputs(ws,[('start','Project start date',datetime.date(2027,1,1),D),('build','Construction (months)',30,'0'),('land','Land (SAR)',310000000,N),('cost','Construction cost (SAR)',880000000,N),
  ('offnla','Office NLA (sqm)',42000,N),('offrent','Office rent (SAR/sqm/yr)',2300,N),('retnla','Retail GLA (sqm)',6500,N),('retrent','Retail rent (SAR/sqm/yr)',3100,N),
  ('lease','Lease-up after completion (months)',18,'0'),('exit','Exit yield',0.075,P),('exitm','Sale month after completion',24,'0'),('disc','Discount rate',0.10,P)])
cf=wb.create_sheet('Monthly');cf['A3']='Month';cf['A4']='Date';rows=['Land','Construction','Office rent','Retail rent','Sale','Net cash flow']
R={l:5+i for i,l in enumerate(rows)}
for l,r in R.items():cf[f'A{r}']=l
M=78;last=L(M+2)
for m in range(0,M+1):
    c=L(m+2);cf[f'{c}3']=m;cf[f'{c}4']=f"=EDATE({I['start']},{c}$3)";cf[f'{c}4'].number_format=D
    done=f"({c}$3>{I['build']})";occ=f"MIN(1,MAX(0,({c}$3-{I['build']})/{I['lease']}))"
    live=f"({c}$3<={I['build']}+{I['exitm']})"
    cf[f'{c}{R["Land"]}']=f"=IF({c}$3=0,-{I['land']},0)"
    cf[f'{c}{R["Construction"]}']=f"=IF(AND({c}$3>=1,{c}$3<={I['build']}),-{I['cost']}/{I['build']},0)"
    cf[f'{c}{R["Office rent"]}']=f"={done}*{live}*{I['offnla']}*{I['offrent']}/12*{occ}"
    cf[f'{c}{R["Retail rent"]}']=f"={done}*{live}*{I['retnla']}*{I['retrent']}/12*{occ}"
    cf[f'{c}{R["Sale"]}']=f"=IF({c}$3={I['build']}+{I['exitm']},({I['offnla']}*{I['offrent']}+{I['retnla']}*{I['retrent']})/{I['exit']},0)"
    cf[f'{c}{R["Net cash flow"]}']=f"=SUM({c}{R['Land']}:{c}{R['Sale']})"
summary(wb,'Summary',[('Project IRR (XIRR)',f"=XIRR(Monthly!B{R['Net cash flow']}:{last}{R['Net cash flow']},Monthly!B4:{last}4)",P),('NPV (XNPV)',f"=XNPV(Inputs!B14,Monthly!B{R['Net cash flow']}:{last}{R['Net cash flow']},Monthly!B4:{last}4)",N),
  ('Net profit',f"=SUM(Monthly!B{R['Net cash flow']}:{last}{R['Net cash flow']})",N),('Total development cost',f"=-SUM(Monthly!B{R['Land']}:{last}{R['Construction']})",N),('Profit on cost','=B5/B6',P),('Gross development value',f"=SUM(Monthly!B{R['Sale']}:{last}{R['Sale']})",N),('Completion date',f"=EDATE(Inputs!B3,Inputs!B4)",D)])
wb.save(OUT+'tower_sar.xlsx')

# ---------- land option, GBP ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Option';ws['A1']='HARTLEY FARM – LAND OPTION AGREEMENT (GBP)'
I=inputs(ws,[('acres','Gross site (acres)',62,N2),('net','Net developable (%)',0.65,P),('dph','Dwellings per net hectare',35,N),('gdv','Serviced plot value per dwelling (£)',78000,N),
  ('prob','Probability of allocation',0.55,P),('fee','Option fee per year (£)',45000,N),('term','Option term (years)',5,'0'),('plan','Planning & promotion costs (£)',1250000,N),
  ('disc','Discount to market value for the landowner',0.15,P),('floor','Minimum price per gross acre (£)',120000,N),('share','Promoter fee (% of sale price)',0.20,P),('cap','Promoter fee cap (£)',4500000,N)])
s=wb.create_sheet('Appraisal');rows=[('Net developable hectares',f"={I['acres']}*0.404686*{I['net']}",N2),('Dwellings',f"=ROUND(B3*{I['dph']},0)",N),('Market value of the site',f"=B4*{I['gdv']}",N),
 ('Price after discount',f"=B5*(1-{I['disc']})",N),('Minimum price',f"={I['acres']}*{I['floor']}",N),('Sale price','=MAX(B6,B7)',N),('Promoter fee',f"=MIN(B8*{I['share']},{I['cap']})",N),
 ('Promoter costs',f"={I['plan']}+{I['fee']}*{I['term']}",N),('Promoter profit if allocated','=B9-B10',N),('Expected promoter profit',f"={I['prob']}*B9-B10",N),('Promoter return on cost','=B12/B10',P),
 ('Landowner receipt if allocated','=B8-B9',N),('Net profit','=B12',N),('Profit on cost','=B13',P)]
for i,(lab,f,fm) in enumerate(rows):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'option_gbp.xlsx')

# ---------- flex office, EUR ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Assumptions';ws['A1']='AMSTEL WORKS – FLEX OFFICE OPERATING MODEL (EUR)'
I=inputs(ws,[('desks','Desks',620,N),('fit','Fit-out per desk (EUR)',6800,N),('lease','Head lease rent (EUR/yr)',1150000,N),('stab','Stabilised occupancy',0.85,P),('ramp','Ramp to stabilised (months)',14,'0'),
  ('churn','Monthly churn',0.035,P),('acq','Sales cost per new member (EUR)',420,N),('tier','Price tier (1 = Hot desk, 2 = Fixed, 3 = Office)',2,'0'),('opex','Opex per desk per month (EUR)',60,N),('exitm','EBITDA exit multiple',8,'0.0"x"')])
pt=wb.create_sheet('Price Tiers');pt.append(['Tier','Name','Price per desk per month (EUR)']);[pt.append(list(r)) for r in [(1,'Hot desk',290),(2,'Fixed desk',410),(3,'Private office',560)]]
cf=wb.create_sheet('Monthly');cf['A3']='Month';rows=['Occupancy','Members','Revenue','Churned members','Sales cost','Opex','Head lease','EBITDA','Fit-out','Exit value','Net cash flow']
R={l:4+i for i,l in enumerate(rows)}
for l,r in R.items():cf[f'A{r}']=l
M=60;last=L(M+2)
for m in range(0,M+1):
    c=L(m+2);cf[f'{c}3']=m;on=f"({c}$3>=1)"
    cf[f'{c}{R["Occupancy"]}']=f"={on}*{I['stab']}*MIN(1,{c}$3/{I['ramp']})"
    cf[f'{c}{R["Members"]}']=f"={c}{R['Occupancy']}*{I['desks']}"
    cf[f'{c}{R["Revenue"]}']=f"={c}{R['Members']}*INDEX('Price Tiers'!$C$2:$C$4,{I['tier']})"
    cf[f'{c}{R["Churned members"]}']=f"={c}{R['Members']}*{I['churn']}"
    prev=L(m+1)
    cf[f'{c}{R["Sales cost"]}']=(f"=-({c}{R['Churned members']}+MAX(0,{c}{R['Members']}-{prev}{R['Members']}))*{I['acq']}" if m>0 else '=0')
    cf[f'{c}{R["Opex"]}']=f"=-{on}*{I['desks']}*{I['opex']}"
    cf[f'{c}{R["Head lease"]}']=f"=-{on}*{I['lease']}/12"
    cf[f'{c}{R["EBITDA"]}']=f"=SUM({c}{R['Revenue']},{c}{R['Sales cost']}:{c}{R['Head lease']})"
    cf[f'{c}{R["Fit-out"]}']=f"=IF({c}$3=0,-{I['desks']}*{I['fit']},0)"
    cf[f'{c}{R["Exit value"]}']=f"=IF({c}$3={M},SUM({L(M-10)}{R['EBITDA']}:{c}{R['EBITDA']})*{I['exitm']},0)"
    cf[f'{c}{R["Net cash flow"]}']=f"={c}{R['EBITDA']}+{c}{R['Fit-out']}+{c}{R['Exit value']}"
summary(wb,'Returns',[('Unlevered IRR (annualised)',f"=(1+IRR(Monthly!B{R['Net cash flow']}:{last}{R['Net cash flow']},0.02))^12-1",P),('Net profit',f"=SUM(Monthly!B{R['Net cash flow']}:{last}{R['Net cash flow']})",N),
  ('Stabilised EBITDA (annual)',f"=SUM(Monthly!{L(M-10)}{R['EBITDA']}:{last}{R['EBITDA']})",N),('Total cost',f"=-Monthly!B{R['Fit-out']}",N),('Equity multiple',f"=SUMIF(Monthly!B{R['Net cash flow']}:{last}{R['Net cash flow']},\">0\")/-SUMIF(Monthly!B{R['Net cash flow']}:{last}{R['Net cash flow']},\"<0\")",'0.00"x"')])
wb.save(OUT+'flex_eur.xlsx')

# ---------- car park, AED ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='MARINA GATE – MULTI-STOREY CAR PARK (AED)'
I=inputs(ws,[('bays','Bays',1450,N),('band','Tariff band (1 = Standard, 2 = Premium, 3 = Event)',1,'0'),('wd','Weekday occupancy',0.62,P),('we','Weekend occupancy',0.78,P),('turn','Turnover per bay per day',2.4,N2),
  ('stay','Average stay (hours)',2.5,N2),('season','Season ticket holders',260,N),('seasonp','Season ticket (AED/month)',650,N),('cost','Build cost per bay (AED)',95000,N),('opex','Opex (% of revenue)',0.28,P),('exit','Exit yield',0.08,P),('hold','Hold (years)',10,'0'),('growth','Tariff growth',0.03,P)])
tf=wb.create_sheet('Tariffs');tf.append(['Band','First hour (AED)','Each extra hour (AED)']);[tf.append(list(r)) for r in [(1,10,8),(2,15,12),(3,25,20)]]
s=wb.create_sheet('Operations');rows=[('Ticket per visit (AED)',f"=CHOOSE({I['band']},Tariffs!B2,Tariffs!B3,Tariffs!B4)+MAX(0,{I['stay']}-1)*CHOOSE({I['band']},Tariffs!C2,Tariffs!C3,Tariffs!C4)",N2),
 ('Visits per year',f"=({I['bays']}-{I['season']})*{I['turn']}*(260*{I['wd']}+105*{I['we']})",N),('Transient revenue','=B3*B4',N),('Season revenue',f"={I['season']}*{I['seasonp']}*12",N),('Revenue (year 1)','=B5+B6',N),('Opex',f"=-B7*{I['opex']}",N),('NOI (year 1)','=B7+B8',N),('Build cost',f"={I['bays']}*{I['cost']}",N)]
for i,(lab,f,fm) in enumerate(rows):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';cf['A4']='NOI';cf['A5']='Capex';cf['A6']='Sale';cf['A7']='Net cash flow'
for y in range(0,13):
    c=L(y+2);cf[f'{c}3']=y
    cf[f'{c}4']=f"=IF(AND({c}$3>=1,{c}$3<={I['hold']}),Operations!$B$9*(1+{I['growth']})^({c}$3-1),0)"
    cf[f'{c}5']=f"=IF({c}$3=0,-Operations!$B$10,0)"
    cf[f'{c}6']=f"=IF({c}$3={I['hold']},Operations!$B$9*(1+{I['growth']})^{c}$3/{I['exit']},0)"
    cf[f'{c}7']=f"=SUM({c}4:{c}6)"
summary(wb,'Summary',[('Unlevered IRR',"=IRR('Cash Flow'!B7:N7)",P),('Yield on cost','=Operations!B9/Operations!B10',P),('Net profit',"=SUM('Cash Flow'!B7:N7)",N),('Total development cost','=Operations!B10',N),('Revenue per bay (AED/yr)',f"=Operations!B7/{I['bays']}",N)])
wb.save(OUT+'park_aed.xlsx')

# ---------- townhouses, CAD, OFFSET release schedule ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='MAPLE RIDGE TOWNHOMES – BUILD TO SELL (CAD)'
I=inputs(ws,[('units','Townhomes',96,N),('price','Average sale price (C$)',845000,N),('pace','Sales pace (homes per quarter)',12,N),('delay','Sales start (quarter)',2,'0'),('hard','Hard cost per home (C$)',410000,N),
  ('soft','Soft costs (% of hard)',0.16,P),('land','Land (C$)',18500000,N),('dc','Development charges per home (C$)',62000,N),('comm','Commission',0.04,P),('hpa','Price growth per quarter',0.006,P)])
rs=wb.create_sheet('Releases');rs.append(['Release','Homes'])
for i,h in enumerate([24,24,24,24],start=1):rs.append([i,h])
cf=wb.create_sheet('Quarterly');cf['A3']='Quarter';rows=['Homes available','Homes sold','Cumulative sold','Revenue','Hard & soft','Land & charges','Commission','Net cash flow']
R={l:4+i for i,l in enumerate(rows)}
for l,r in R.items():cf[f'A{r}']=l
Q=16;last=L(Q+2)
for q in range(0,Q+1):
    c=L(q+2);p=L(q+1);cf[f'{c}3']=q
    cf[f'{c}{R["Homes available"]}']=f"=IFERROR(SUM(OFFSET(Releases!$B$2,0,0,MIN(4,MAX(0,INT(({c}$3-{I['delay']})/2)+1)),1)),0)*({c}$3>={I['delay']})"
    cf[f'{c}{R["Homes sold"]}']=(f"=MAX(0,MIN({I['pace']},{c}{R['Homes available']}-{p}{R['Cumulative sold']}))*({c}$3>={I['delay']})" if q>0 else '=0')
    cf[f'{c}{R["Cumulative sold"]}']=(f"={p}{R['Cumulative sold']}+{c}{R['Homes sold']}" if q>0 else f"={c}{R['Homes sold']}")
    cf[f'{c}{R["Revenue"]}']=f"={c}{R['Homes sold']}*{I['price']}*(1+{I['hpa']})^{c}$3"
    cf[f'{c}{R["Hard & soft"]}']=f"=-IF(AND({c}$3>=1,{c}$3<=8),{I['units']}*{I['hard']}*(1+{I['soft']})/8,0)"
    cf[f'{c}{R["Land & charges"]}']=f"=IF({c}$3=0,-{I['land']}-{I['units']}*{I['dc']},0)"
    cf[f'{c}{R["Commission"]}']=f"=-{c}{R['Revenue']}*{I['comm']}"
    cf[f'{c}{R["Net cash flow"]}']=f"=SUM({c}{R['Revenue']}:{c}{R['Commission']})"
summary(wb,'Summary',[('Project IRR (annual)',f"=(1+IRR(Quarterly!B{R['Net cash flow']}:{last}{R['Net cash flow']}))^4-1",P),('Net profit',f"=SUM(Quarterly!B{R['Net cash flow']}:{last}{R['Net cash flow']})",N),
  ('Total development cost',f"=-SUM(Quarterly!B{R['Hard & soft']}:{last}{R['Land & charges']})",N),('Profit on cost','=B4/B5',P),('Homes unsold at the end',f"={I['units']}-Quarterly!{last}{R['Cumulative sold']}",N),('Gross revenue',f"=SUM(Quarterly!B{R['Revenue']}:{last}{R['Revenue']})",N)])
wb.save(OUT+'towns_cad.xlsx')
print('ok')

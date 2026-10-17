# round 24: a CIO's desk on new ground again
#  farm     - SAR date-palm plantation, 30 years: trees planted in four blocks, yield by tree age through LOOKUP over age bands,
#             grade mix, price index, water and labour, irrigation capex replaced every 12 years, government subsidy in the first years
#  mall     - AED regional mall, monthly 10 years: anchors and line shops, base rent plus turnover rent above a breakpoint, service
#             charge recovered with a cap, leases expiring on dates and re-let after a void at market, sale at an exit yield
#  toll     - EUR toll road, annual 30 years: traffic ramp-up, tariff elasticity (POWER), indexed tariffs rounded to 0.10 (MROUND),
#             heavy and light vehicles, O&M with major maintenance, senior debt with DSCR, a tail before concession end
#  lab      - USD lab conversion: an Excel table of floors with this-row references ([@Rent]) and LET, phased capex, lease-up
#  cloan    - GBP development with a construction loan: interest and a fee on the undrawn commitment capitalised (circular), LTC test
import openpyxl,os,datetime
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.table import Table,TableStyleInfo
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m24/'
P='0.00%';N='#,##0';X='0.00"x"';D='dd-mmm-yyyy'
def ref(ws,col,r):return (f"'{ws.title}'" if ' ' in ws.title else ws.title)+f"!${L(col)}${r}"
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

# ================= 24A date farm =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='WADI AL NAKHEEL – DATE PALM PLANTATION (SAR)'
I=inputs(ws,[('price','Price per tonne, premium grade (SAR)',14500,N),('disc','Standard grade discount',0.35,P),('prem','Premium share of the crop',0.55,P),('pidx','Price growth a year',0.02,P),
 ('water','Water and power per tree a year (SAR)',95,N),('labour','Labour per tree a year (SAR)',140,N),('wg','Cost growth a year',0.03,P),('irr','Irrigation capex per tree (SAR)',260,N),('life','Irrigation life (years)',12,'0'),
 ('sub','Subsidy per tree, first 5 years (SAR)',60,N),('land','Land and planting (SAR)',185000000,N),('disc_r','Discount rate',0.09,P)])
bl=wb.create_sheet('Blocks');bl.append(['Block','Trees','Planted in year'])
for row_ in [('Block A',42000,0),('Block B',38000,2),('Block C',51000,4),('Block D',29000,7)]:bl.append(list(row_))
yb=wb.create_sheet('Yield');yb.append(['Tree age from (years)','Kg per tree'])
for a,k in [(0,0),(4,8),(6,25),(8,45),(10,70),(15,85),(25,75),(35,55)]:yb.append([a,k])
cf=wb.create_sheet('Cash Flow');T=30
labs=['Year']+[f'Block {k} kg' for k in 'ABCD']+['Trees bearing','Crop (tonnes)','Price index','Revenue','Operating cost','Irrigation','Subsidy','Land and planting','Net cash flow','Cumulative cash']
def ff(t,c,p,R):
    y=f"{c}$3";d={'Year':t}
    for i,k in enumerate('ABCD',2):d[f'Block {k} kg']=f"IF({y}>=Blocks!$C${i},Blocks!$B${i}*LOOKUP({y}-Blocks!$C${i},Yield!$A$2:$A$9,Yield!$B$2:$B$9),0)"
    d['Trees bearing']="+".join(f"IF({y}>=Blocks!$C${i},Blocks!$B${i},0)" for i in range(2,6))
    d['Crop (tonnes)']="("+"+".join(f"{c}{R[f'Block {k} kg']}" for k in 'ABCD')+")/1000"
    d['Price index']=f"(1+{I['pidx']})^{y}"
    d['Revenue']=f"{c}{R['Crop (tonnes)']}*{I['price']}*{c}{R['Price index']}*({I['prem']}+(1-{I['prem']})*(1-{I['disc']}))"
    d['Operating cost']=f"{c}{R['Trees bearing']}*({I['water']}+{I['labour']})*(1+{I['wg']})^{y}"
    d['Irrigation']="+".join(f"IF(AND({y}>=Blocks!$C${i},MOD({y}-Blocks!$C${i},{I['life']})=0),Blocks!$B${i}*{I['irr']}*(1+{I['wg']})^{y},0)" for i in range(2,6))
    d['Subsidy']="+".join(f"IF(AND({y}>=Blocks!$C${i},{y}<Blocks!$C${i}+5),Blocks!$B${i}*{I['sub']},0)" for i in range(2,6))
    d['Land and planting']=f"IF({y}=0,{I['land']},0)"
    d['Net cash flow']=f"{c}{R['Revenue']}-{c}{R['Operating cost']}-{c}{R['Irrigation']}+{c}{R['Subsidy']}-{c}{R['Land and planting']}"
    d['Cumulative cash']=f"SUM($B${R['Net cash flow']}:{c}{R['Net cash flow']})"
    return d
R=timeline(cf,labs,T,ff);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Project IRR',f"=IRR({row('Net cash flow')})",P),('NPV at the discount rate (SAR)',f"={row('Net cash flow').split(':')[0]}+NPV({I['disc_r']},'Cash Flow'!$C${R['Net cash flow']}:${E}${R['Net cash flow']})",N),
 ('Peak crop (tonnes)',f"=MAX({row('Crop (tonnes)')})",N),('Payback year',f"=IF(INDEX({row('Cumulative cash')},{T}+1)>0,COUNTIF({row('Cumulative cash')},\"<=0\"),\"not reached\")",'0'),
 ('Revenue over 30 years (SAR)',f"=SUM({row('Revenue')})",N),('Net profit (SAR)',f"=SUM({row('Net cash flow')})",N)])
wb.save(OUT+'farm_sar.xlsx')

# ================= 24B mall =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='AL WASL GALLERIA – REGIONAL MALL, MONTHLY (AED)'
I=inputs(ws,[('start','Model start',datetime.date(2026,12,31),D),('mkt','Market rent line shops (AED/sqm/yr)',2600,N),('mg','Market rent growth',0.03,P),('void','Re-letting void (months)',6,'0'),
 ('sg','Tenant sales growth',0.04,P),('sc','Service charge (AED/sqm/yr)',310,N),('cap','Service charge recovery cap (AED/sqm/yr)',290,N),('scg','Service charge growth',0.035,P),('xy','Exit yield',0.075,P),('price','Purchase price (AED)',2650000000,N)])
tn=wb.create_sheet('Tenants');tn.append(['Tenant','Area (sqm)','Base rent (AED/sqm/yr)','Sales (AED/sqm/yr)','Turnover rent share','Lease expiry'])
for row_ in [('Hypermarket',22000,650,9500,0.08,datetime.date(2034,6,30)),('Department store',15000,820,7800,0.12,datetime.date(2031,12,31)),('Cinema',8000,700,5200,0.15,datetime.date(2029,3,31)),
             ('Fashion line shops',26000,2450,14500,0.2,datetime.date(2028,9,30)),('F&B court',9000,2900,16800,0.2,datetime.date(2027,12,31)),('Electronics',6000,2300,21000,0.12,datetime.date(2030,6,30))]:tn.append(list(row_))
for r in range(2,8):tn.cell(r,6).number_format=D
cf=wb.create_sheet('Cash Flow');T=120
labs=['Month','Date']+[f'Rent {k}' for k in range(1,7)]+['Base and re-let rent','Turnover rent','Service charge cost','Service charge recovered','Net operating income','Equity cash flow']
def mf(t,c,p,R):
    m=f"{c}$3";first=t==0;d={'Month':t,'Date':f"EOMONTH({I['start']},{m})"}
    to=[]
    for k in range(1,7):
        r=k+1;area=f"Tenants!$B${r}";base=f"Tenants!$C${r}";sales=f"Tenants!$D${r}";sh=f"Tenants!$E${r}";exp=f"Tenants!$F${r}";dt=f"{c}{R['Date']}"
        relet=f"EOMONTH({exp},{I['void']})"
        d[f'Rent {k}']='0' if first else f"IF({dt}<={exp},{area}*{base}/12,IF({dt}<={relet},0,{area}*{I['mkt']}*(1+{I['mg']})^({m}/12)/12*IF({base}<1000,0.35,1)))"
        to.append(f"IF({dt}<={exp},MAX(0,{area}*{sales}*(1+{I['sg']})^({m}/12)/12*{sh}-{area}*{base}/12),0)")
    d['Base and re-let rent']="+".join(f"{c}{R[f'Rent {k}']}" for k in range(1,7))
    d['Turnover rent']='0' if first else "+".join(to)
    d['Service charge cost']='0' if first else f"SUM(Tenants!$B$2:$B$7)*{I['sc']}*(1+{I['scg']})^({m}/12)/12"
    d['Service charge recovered']='0' if first else f"MIN({c}{R['Service charge cost']},SUM(Tenants!$B$2:$B$7)*{I['cap']}/12)"
    d['Net operating income']=f"{c}{R['Base and re-let rent']}+{c}{R['Turnover rent']}-{c}{R['Service charge cost']}+{c}{R['Service charge recovered']}"
    d['Equity cash flow']=f"-{I['price']}" if first else f"{c}{R['Net operating income']}+IF({m}={T},SUM({L(max(2,t-10))}{R['Net operating income']}:{c}{R['Net operating income']})*12/MIN(12,{m})/{I['xy']},0)"
    return d
R=timeline(cf,labs,T,mf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
table(wb.create_sheet('Returns'),[('Unlevered IRR',f"=(1+IRR({row('Equity cash flow')},0.006))^12-1",P),('Turnover rent share of income',f"=SUM({row('Turnover rent')})/(SUM({row('Base and re-let rent')})+SUM({row('Turnover rent')}))",P),
 ('Service charge leakage (AED)',f"=SUM({row('Service charge cost')})-SUM({row('Service charge recovered')})",N),('Leases expiring by 2030',"=COUNTIFS(Tenants!$F$2:$F$7,\"<=\"&DATE(2030,12,31))",'0'),
 ('Net initial yield',f"=SUM('Cash Flow'!$C${R['Net operating income']}:$N${R['Net operating income']})/{I['price']}",P),('Net profit (AED)',f"=SUM({row('Equity cash flow')})",N)])
wb.save(OUT+'mall_aed.xlsx')

# ================= 24C toll road =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='A-17 TOLL MOTORWAY – CONCESSION (EUR)'
I=inputs(ws,[('light','Light vehicles a day (year 1)',38000,N),('heavy','Heavy vehicles a day (year 1)',6500,N),('ramp','Ramp-up years',4,'0'),('g','Traffic growth a year',0.022,P),('tl','Tariff light (EUR)',4.2,'0.00'),('th','Tariff heavy (EUR)',11.5,'0.00'),
 ('cpi','Tariff indexation',0.02,P),('el','Elasticity of traffic to tariff',-0.25,'0.00'),('tchg','Tariff change vs base',0,P),('om','O&M a year (EUR)',21000000,N),('mm','Major maintenance every (years)',8,'0'),('mmc','Major maintenance (EUR)',65000000,N),
 ('debt','Senior debt (EUR)',780000000,N),('rate','Interest rate',0.048,P),('tenor','Debt tenor (years)',22,'0'),('conc','Concession (years)',30,'0'),('capex','Construction cost (EUR)',1150000000,N)])
cf=wb.create_sheet('Cash Flow');T=30
labs=['Year','Ramp-up factor','Tariff light','Tariff heavy','Light traffic','Heavy traffic','Revenue','O&M','Major maintenance','CFADS','Opening debt','Interest','Repayment','DSCR','Equity cash flow']
def tf(t,c,p,R):
    y=f"{c}$3";first=t==0
    d={'Year':t,'Ramp-up factor':f"IF({y}=0,0,MIN(1,0.6+0.4*({y}-1)/{I['ramp']}))",
     'Tariff light':f"MROUND({I['tl']}*(1+{I['tchg']})*(1+{I['cpi']})^MAX(0,{y}-1),0.1)",'Tariff heavy':f"MROUND({I['th']}*(1+{I['tchg']})*(1+{I['cpi']})^MAX(0,{y}-1),0.1)",
     'Light traffic':f"IF(AND({y}>=1,{y}<={I['conc']}),{I['light']}*365*{c}{R['Ramp-up factor']}*(1+{I['g']})^({y}-1)*POWER(1+{I['tchg']},{I['el']}),0)",
     'Heavy traffic':f"IF(AND({y}>=1,{y}<={I['conc']}),{I['heavy']}*365*{c}{R['Ramp-up factor']}*(1+{I['g']})^({y}-1)*POWER(1+{I['tchg']},{I['el']}),0)",
     'Revenue':f"{c}{R['Light traffic']}*{c}{R['Tariff light']}+{c}{R['Heavy traffic']}*{c}{R['Tariff heavy']}",
     'O&M':f"IF(AND({y}>=1,{y}<={I['conc']}),{I['om']}*(1+{I['cpi']})^({y}-1),0)",'Major maintenance':f"IF(AND({y}>=1,{y}<={I['conc']},MOD({y},{I['mm']})=0),{I['mmc']}*(1+{I['cpi']})^({y}-1),0)",
     'CFADS':f"{c}{R['Revenue']}-{c}{R['O&M']}-{c}{R['Major maintenance']}",'Opening debt':f"{I['debt']}" if first else f"{p}{R['Opening debt']}-{p}{R['Repayment']}",
     'Interest':'0' if first else f"{c}{R['Opening debt']}*{I['rate']}",'Repayment':'0' if first else f"IF({y}={I['tenor']},{c}{R['Opening debt']},IF(AND({y}>2,{y}<{I['tenor']}),MIN({c}{R['Opening debt']},-PPMT({I['rate']},{y}-2,{I['tenor']}-2,{I['debt']})),0))",
     'DSCR':f"IF({c}{R['Interest']}+{c}{R['Repayment']}>0,{c}{R['CFADS']}/({c}{R['Interest']}+{c}{R['Repayment']}),0)",
     'Equity cash flow':f"-({I['capex']}-{I['debt']})" if first else f"{c}{R['CFADS']}-{c}{R['Interest']}-{c}{R['Repayment']}"}
    return d
R=timeline(cf,labs,T,tf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Equity IRR',f"=IRR({row('Equity cash flow')})",P),('Minimum DSCR',f"=_xlfn.MINIFS({row('DSCR')},{row('DSCR')},\">0\")",X),('Average DSCR',f"=AVERAGEIF({row('DSCR')},\">0\")",X),
 ('Tail (years after the debt)',f"={I['conc']}-{I['tenor']}",'0'),('Revenue over the concession (EUR)',f"=SUM({row('Revenue')})",N),('Peak debt (EUR)',f"={I['debt']}",N),('Net profit (EUR)',f"=SUM({row('Equity cash flow')})",N)])
wb.save(OUT+'toll_eur.xlsx')

# ================= 24D lab conversion (table with this-row references) =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='KENDALL LABS – OFFICE TO LAB CONVERSION (USD)'
I=inputs(ws,[('price','Acquisition (USD)',190000000,N),('capex','Conversion capex per sq ft (USD)',420,N),('rent','Lab rent per sq ft a year (USD)',142,N),('opex','Operating cost per sq ft (USD)',22,N),('xy','Exit cap rate',0.0575,P),('lease','Months to lease each floor after conversion',9,'0')])
fl=wb.create_sheet('Floors');fl.append(['Floor','Area (sq ft)','Conversion quarter','Rent premium','Net rent a year','Stabilised value'])
for i,(f,a,q,prem) in enumerate([('L1',38000,2,0.05),('L2',38000,3,0),('L3',38000,4,0),('L4',36000,5,0.02),('L5',34000,6,0.08)],2):
    fl.cell(i,1,f);fl.cell(i,2,a);fl.cell(i,3,q);fl.cell(i,4,prem)
    fl.cell(i,5,f"=_xlfn.LET(_xlpm.r,Inputs!$B$5*(1+Floors[[#This Row],[Rent premium]]),Floors[[#This Row],[Area (sq ft)]]*(_xlpm.r-Inputs!$B$6))")
    fl.cell(i,6,"=Floors[[#This Row],[Net rent a year]]/Inputs!$B$7")
t=Table(displayName='Floors',ref='A1:F6');t.tableStyleInfo=TableStyleInfo(name='TableStyleMedium9',showRowStripes=True);fl.add_table(t)
table(wb.create_sheet('Returns'),[('Total area (sq ft)',"=SUM(Floors[Area (sq ft)])",N),('Conversion capex (USD)',f"=B3*{I['capex']}",N),('Stabilised net rent (USD)',"=SUM(Floors[Net rent a year])",N),
 ('Gross development value (USD)',"=SUM(Floors[Stabilised value])",N),('Total cost (USD)',f"={I['price']}+B4",N),('Net profit (USD)',"=B6-B7",N),('Profit on cost',"=B8/B7",P),('Yield on cost',"=B5/B7",P)])
wb.save(OUT+'lab_usd.xlsx')

# ================= 24E construction loan, circular =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='ELM PARK – RESIDENTIAL WITH A CONSTRUCTION LOAN (GBP)'
I=inputs(ws,[('land','Land (£)',42000000,N),('build','Build cost (£)',118000000,N),('months','Build (months)',24,'0'),('ltc','Loan to cost',0.65,P),('rate','Interest rate',0.075,P),('fee','Commitment fee on undrawn',0.012,P),
 ('arr','Arrangement fee',0.015,P),('gdv','Sales (£)',212000000,N),('sell','Sales period (months)',12,'0')])
cf=wb.create_sheet('Cash Flow');T=40
labs=['Month','Build cost','Land','Arrangement fee','Interest','Commitment fee','Total cost','Facility','Loan drawn','Loan balance','Sales','Repayment','Equity cash flow']
def cff(t,c,p,R):
    m=f"{c}$3";first=t==0;M=I['months']
    d={'Month':t,'Build cost':f"IF(AND({m}>=1,{m}<={M}),{I['build']}/{M},0)",'Land':f"IF({m}=0,{I['land']},0)",
     'Facility':f"({I['land']}+{I['build']})*{I['ltc']}/(1-{I['ltc']}*({I['rate']}*{M}/24+{I['fee']}/2))*0+(SUM($B${R['Build cost']}:${L(T+2)}${R['Build cost']})+{I['land']}+SUM($B${R['Interest']}:${L(T+2)}${R['Interest']})+SUM($B${R['Commitment fee']}:${L(T+2)}${R['Commitment fee']})+SUM($B${R['Arrangement fee']}:${L(T+2)}${R['Arrangement fee']}))*{I['ltc']}",
     'Arrangement fee':f"IF({m}=0,{c}{R['Facility']}*{I['arr']},0)",
     'Interest':'0' if first else f"IF({m}<={M},{p}{R['Loan balance']}*{I['rate']}/12,0)",
     'Commitment fee':'0' if first else f"IF({m}<={M},MAX(0,{c}{R['Facility']}-{p}{R['Loan balance']})*{I['fee']}/12,0)",
     'Total cost':f"{c}{R['Build cost']}+{c}{R['Land']}+{c}{R['Arrangement fee']}+{c}{R['Interest']}+{c}{R['Commitment fee']}",
     'Loan drawn':f"IF({m}<={M},MIN({c}{R['Total cost']}*{I['ltc']}/(1),{c}{R['Facility']}-{('0' if first else p+str(R['Loan balance']))}),0)",
     'Sales':f"IF(AND({m}>{M},{m}<={M}+{I['sell']}),{I['gdv']}/{I['sell']},0)",
     'Repayment':f"MIN({('0' if first else p+str(R['Loan balance']))}+{c}{R['Loan drawn']},{c}{R['Sales']})",
     'Loan balance':f"{('0' if first else p+str(R['Loan balance']))}+{c}{R['Loan drawn']}-{c}{R['Repayment']}",
     'Equity cash flow':f"{c}{R['Sales']}-{c}{R['Repayment']}-({c}{R['Total cost']}-{c}{R['Loan drawn']})"}
    return d
R=timeline(cf,labs,T,cff);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Levered IRR',f"=(1+IRR({row('Equity cash flow')},0.02))^12-1",P),('Facility (£)',f"='Cash Flow'!B{R['Facility']}",N),('Peak debt (£)',f"=MAX({row('Loan balance')})",N),
 ('Interest and fees capitalised (£)',f"=SUM({row('Interest')})+SUM({row('Commitment fee')})+SUM({row('Arrangement fee')})",N),('Total cost (£)',f"=SUM({row('Total cost')})",N),('Net profit (£)',f"=SUM({row('Equity cash flow')})",N),('Profit on cost',"=B8/B7",P)])
from openpyxl.workbook.properties import CalcProperties
wb.calculation=CalcProperties(iterate=True,iterateCount=200,iterateDelta=1e-9,fullCalcOnLoad=True)
wb.save(OUT+'cloan_gbp.xlsx')
print('ok')

# round 23: a CIO's desk on new ground again
#  glease   - GBP 99-year ground lease, annual to 2125: dates past 2100 (2100 is not a leap year), occupational rents with upward-only
#             reviews every five years to RPI with a collar, a geared headlease rent (share of occupational rent), the freeholder's
#             value by XNPV over a century, the leasehold interest's value at a chosen year by NPV of its remaining profit rent
#  berlin   - EUR residential portfolio, 180 months: four building groups, rents capped (no more than 15% over three years), tenant
#             turnover re-let at market, refurbishment every eight years by group (MOD), interest-only then amortising loan,
#             sale in the last month at an exit yield; ICR by month
#  modern   - USD Excel 365 model: an Excel table read by structured references, LET, SEQUENCE, XLOOKUP and FILTER
#  risk     - SAR mixed-use with a risk sheet drawing RAND() (a simulated cost overrun) beside a deterministic base case
#  tender   - AED contractor's tender: bill of quantities, S-curve, retention released half at completion and half after the
#             defects period, liquidated damages capped, change orders, client paying 60 days late (OFFSET by a computed lag), NPV
import openpyxl,os,datetime
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.table import Table,TableStyleInfo
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m23/'
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

# ================= 23A ground lease =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='KINGS WHARF – 99-YEAR GROUND LEASE (GBP)'
I=inputs(ws,[('start','Lease start',datetime.date(2026,12,25),D),('rent0','Occupational rent year 1 (£)',4800000,N),('gear','Ground rent share of occupational rent',0.12,P),('rpi','RPI a year',0.03,P),
 ('floor','Review collar · floor a year',0.01,P),('cap','Review collar · cap a year',0.04,P),('every','Review every (years)',5,'0'),('disc','Freeholder discount rate',0.045,P),('ldisc','Leasehold discount rate',0.07,P),('vyear','Leasehold valuation year',10,'0'),('term','Lease term (years)',99,'0')])
cf=wb.create_sheet('Cash Flow');T=99
labs=['Year','Date','Review year','Indexation since last review','Occupational rent','Ground rent','Profit rent']
def gf(t,c,p,R):
    y=f"{c}$3";first=t==0
    d={'Year':t+1,'Date':f"DATE(YEAR({I['start']})+{y}-1,MONTH({I['start']}),DAY({I['start']}))",
     'Review year':f"IF(AND({y}>1,MOD({y}-1,{I['every']})=0),1,0)",
     'Indexation since last review':f"MIN((1+{I['cap']})^{I['every']},MAX((1+{I['floor']})^{I['every']},(1+{I['rpi']})^{I['every']}))",
     'Occupational rent':f"{I['rent0']}" if first else f"IF({c}{R['Review year']}=1,MAX({p}{R['Occupational rent']},{p}{R['Occupational rent']}*{c}{R['Indexation since last review']}),{p}{R['Occupational rent']})*IF({y}<={I['term']},1,0)",
     'Ground rent':f"{c}{R['Occupational rent']}*{I['gear']}",'Profit rent':f"{c}{R['Occupational rent']}-{c}{R['Ground rent']}"}
    return d
R=timeline(cf,labs,T,gf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
table(wb.create_sheet('Returns'),[('Freeholder value (XNPV of ground rent, £)',f"=XNPV({I['disc']},{row('Ground rent')},{row('Date')})",N),('Initial yield on freehold value',f"={I['rent0']}*{I['gear']}/B3",P),
 ('Leasehold value at the valuation year (£)',f"=NPV({I['ldisc']},OFFSET('Cash Flow'!$B${R['Profit rent']},0,{I['vyear']},1,{I['term']}-{I['vyear']}))",N),('Ground rent in year 50 (£)',f"=INDEX({row('Ground rent')},50)",N),
 ('Last rent date',f"=INDEX({row('Date')},{I['term']})",D),('Total ground rent over the term (£)',f"=SUM({row('Ground rent')})",N),('Ground rent in 2100 (£)',f"=SUMPRODUCT((YEAR({row('Date')})=2100)*{row('Ground rent')})",N),('Net profit (£)',f"=SUM({row('Profit rent')})",N)])
wb.save(OUT+'glease_gbp.xlsx')

# ================= 23B Berlin monthly =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='SPREE QUARTIER – BERLIN RESIDENTIAL PORTFOLIO, MONTHLY (EUR)'
I=inputs(ws,[('start','Acquisition date',datetime.date(2026,12,31),D),('price','Purchase price (€)',412000000,N),('costs','Purchase costs',0.085,P),('mkt0','Market rent (€/sqm/month)',16.5,'0.00'),('mg','Market rent growth a year',0.035,P),
 ('cap3','Rent cap (max increase over 3 years)',0.15,P),('turn','Tenant turnover a year',0.08,P),('opex','Non-recoverable costs (% of rent)',0.12,P),('ltv','Loan to value',0.55,P),('rate','Interest rate',0.041,P),('io','Interest-only (months)',60,'0'),
 ('amort','Amortisation a year after interest-only',0.02,P),('xy','Exit yield',0.034,P),('refurb','Refurbishment (€/sqm)',420,N)])
gr=wb.create_sheet('Groups');gr.append(['Group','Lettable area (sqm)','In-place rent (€/sqm/month)','Refurbishment cycle (years)','First refurbishment (month)'])
for i,row_ in enumerate([('Altbau Mitte',38000,11.2,8,14),('Plattenbau Ost',52000,8.9,8,30),('Neubau Nord',21000,14.8,10,70),('Gründerzeit West',29000,12.6,8,48)],2):
    for j,v in enumerate(row_,1):gr.cell(i,j,v)
cf=wb.create_sheet('Cash Flow');T=180
labs=['Month','Date','Market rent']+[f'{x} {k}' for k in range(1,5) for x in ('Rent','Refurb')]+['Rent roll','Refurbishment','Net operating income','Loan balance','Interest','Amortisation','ICR','Sale','Equity cash flow']
def bf(t,c,p,R):
    m=f"{c}$3";first=t==0;d={'Month':t,'Date':f"EOMONTH({I['start']},{m})",'Market rent':f"{I['mkt0']}*(1+{I['mg']})^({m}/12)"}
    for k in range(1,5):
        r=k+1;area=f"Groups!$B${r}";r0=f"Groups!$C${r}";cyc=f"Groups!$D${r}";f1=f"Groups!$E${r}"
        # monthly: the share turning over is re-let at market; the rest rises by the cap's monthly equivalent, never above market
        d[f'Rent {k}']=f"{r0}" if first else f"MIN({c}{R['Market rent']},{p}{R[f'Rent {k}']}*(1-{I['turn']}/12)*(1+{I['cap3']})^(1/36)+{c}{R['Market rent']}*{I['turn']}/12)"
        d[f'Refurb {k}']=f"IF(AND({m}>={f1},MOD({m}-{f1},{cyc}*12)=0),{area}*{I['refurb']},0)"
    d['Rent roll']="+".join(f"{c}{R[f'Rent {k}']}*Groups!$B${k+1}" for k in range(1,5))
    d['Refurbishment']="+".join(f"{c}{R[f'Refurb {k}']}" for k in range(1,5))
    d['Net operating income']='0' if first else f"{c}{R['Rent roll']}*(1-{I['opex']})"
    d['Loan balance']=f"{I['price']}*{I['ltv']}" if first else f"MAX(0,{p}{R['Loan balance']}-{c}{R['Amortisation']})*IF({m}<{T},1,0)"
    d['Interest']='0' if first else f"{p}{R['Loan balance']}*{I['rate']}/12"
    d['Amortisation']='0' if first else f"IF({m}>{I['io']},{I['price']}*{I['ltv']}*{I['amort']}/12,0)"
    d['ICR']=f"IF({c}{R['Interest']}>0,{c}{R['Net operating income']}/{c}{R['Interest']},0)"
    d['Sale']=f"IF({m}={T},{c}{R['Net operating income']}*12/{I['xy']},0)"
    d['Equity cash flow']=f"-{I['price']}*(1+{I['costs']}-{I['ltv']})" if first else f"{c}{R['Net operating income']}-{c}{R['Refurbishment']}-{c}{R['Interest']}-{c}{R['Amortisation']}+{c}{R['Sale']}-IF({m}={T},{p}{R['Loan balance']}-{c}{R['Amortisation']},0)"
    return d
R=timeline(cf,labs,T,bf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
table(wb.create_sheet('Returns'),[('Levered IRR',f"=(1+IRR({row('Equity cash flow')},0.005))^12-1",P),('Equity multiple',f"=SUMIF({row('Equity cash flow')},\">0\")/-SUMIF({row('Equity cash flow')},\"<0\")",X),
 ('Minimum ICR',f"=_xlfn.MINIFS({row('ICR')},{row('ICR')},\">0\")",X),('Average rent at exit (€/sqm/month)',f"=INDEX({row('Rent roll')},{T})/SUM(Groups!$B$2:$B$5)",'0.00'),('Market rent at exit (€/sqm/month)',f"=INDEX({row('Market rent')},{T})",'0.00'),
 ('Reversion at exit',"=B7/B6-1",P),('Refurbishment spend (€)',f"=SUM({row('Refurbishment')})",N),('Peak debt (€)',f"=MAX({row('Loan balance')})",N),('Net profit (€)',f"=SUM({row('Equity cash flow')})",N)])
wb.save(OUT+'berlin_eur.xlsx')

# ================= 23C Excel 365 =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='HARBOR POINT – UNIT MIX (USD, EXCEL 365)'
I=inputs(ws,[('price','Price per sq ft ($)',920,N),('cost','Build cost per sq ft ($)',540,N),('soft','Soft costs (% of build)',0.18,P),('land','Land ($)',38000000,N),('esc','Price escalation per floor',0.006,P)])
um=wb.create_sheet('Units');um.append(['Type','Units','Size (sq ft)','Floor from'])
for row_ in [('Studio',60,480,2),('1BR',110,720,4),('2BR',90,1050,8),('3BR',40,1480,14),('PH',8,2600,30)]:um.append(list(row_))
t=Table(displayName='UnitMix',ref='A1:D6');t.tableStyleInfo=TableStyleInfo(name='TableStyleMedium2',showRowStripes=True);um.add_table(t)
rt=wb.create_sheet('Returns')
table(rt,[('Sellable area (sq ft)',"=SUMPRODUCT(UnitMix[Units],UnitMix[Size (sq ft)])",N),('Gross revenue ($)',f"=_xlfn.LET(_xlpm.a,B3,_xlpm.esc,{I['esc']},SUMPRODUCT(UnitMix[Units],UnitMix[Size (sq ft)],{I['price']}*(1+_xlpm.esc*UnitMix[Floor from])))",N),
 ('Total cost ($)',f"=B3*{I['cost']}*(1+{I['soft']})+{I['land']}",N),('Net profit ($)',"=B4-B5",N),('Profit on cost',"=B6/B5",P),('Largest unit type',"=_xlfn.XLOOKUP(MAX(UnitMix[Size (sq ft)]),UnitMix[Size (sq ft)],UnitMix[Type])",'@'),
 ('Units on floors 10 and up',"=SUM(_xlfn._xlws.FILTER(UnitMix[Units],UnitMix[Floor from]>=10))",N),('Sum of the first 5 floor numbers',"=SUM(_xlfn.SEQUENCE(5))",N)])
wb.save(OUT+'modern_usd.xlsx')

# ================= 23D risk with RAND =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='QASR AL RIMAL – MIXED-USE WITH A RISK SHEET (SAR)'
I=inputs(ws,[('gdv','Gross development value (SAR)',1450000000,N),('cost','Construction cost (SAR)',820000000,N),('land','Land (SAR)',260000000,N),('fin','Finance cost (SAR)',95000000,N),('cont','Contingency',0.05,P),('vol','Cost overrun volatility (risk sheet)',0.12,P)])
rk=wb.create_sheet('Risk');rk['A1']='Simulated cost overrun (one draw, recalculates every time)';rk['A2']='Draw';rk['B2']='=RAND()';rk['A3']='Overrun';rk['B3']=f"=_xlfn.NORM.INV(B2,0,{I['vol']})";rk['A4']='Simulated profit (SAR)';rk['B4']=f"={I['gdv']}-{I['cost']}*(1+{I['cont']}+B3)-{I['land']}-{I['fin']}"
rk['A5']='Random scenario number';rk['B5']='=RANDBETWEEN(1,100)'
table(wb.create_sheet('Returns'),[('Net profit (SAR)',f"={I['gdv']}-{I['cost']}*(1+{I['cont']})-{I['land']}-{I['fin']}",N),('Total cost (SAR)',f"={I['cost']}*(1+{I['cont']})+{I['land']}+{I['fin']}",N),('Profit on cost',"=B3/B4",P),('Gross revenue (SAR)',f"={I['gdv']}",N),
 ('Simulated profit, one draw (SAR)',"=Risk!B4",N)])
wb.save(OUT+'risk_sar.xlsx')

# ================= 23E contractor's tender =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='DUBAI CREEK TOWER PODIUM – CONTRACTOR TENDER (AED)'
I=inputs(ws,[('start','Start date',datetime.date(2027,1,31),D),('months','Programme (months)',22,'0'),('markup','Overhead and profit mark-up',0.11,P),('ret','Retention',0.1,P),('dlp','Defects liability period (months)',12,'0'),
 ('days','Client pays after (days)',60,'0'),('ld','Liquidated damages a month (% of contract)',0.005,P),('ldcap','LD cap (% of contract)',0.1,P),('delay','Delay (months)',0,'0'),('co','Change orders (% of contract)',0.04,P),('wacc','Discount rate a year',0.09,P),('adv','Advance payment',0.1,P)])
bq=wb.create_sheet('BOQ');bq.append(['Item','Quantity','Unit rate (AED)','Trade','Cost (AED)'])
for i,row_ in enumerate([('Piling',18500,1150,'Substructure'),('Raft',9200,2650,'Substructure'),('Frame',41000,1820,'Structure'),('Facade',26500,2400,'Envelope'),('MEP',1,98000000,'Services'),('Fit-out',33000,1350,'Finishes'),('External works',1,14000000,'Externals')],2):
    for j,v in enumerate(row_,1):bq.cell(i,j,v)
    bq.cell(i,5,f"=B{i}*C{i}")
cv=wb.create_sheet('Curve');cv.append(['Share of programme','Cumulative work'])
for i,(a,b_) in enumerate([(0,0),(0.1,0.03),(0.2,0.09),(0.3,0.18),(0.4,0.3),(0.5,0.44),(0.6,0.58),(0.7,0.71),(0.8,0.83),(0.9,0.93),(1,1)],2):cv.cell(i,1,a);cv.cell(i,2,b_)
cf=wb.create_sheet('Cash Flow');T=44;PM=f"({I['months']}+{I['delay']})"
labs=['Month','Date','Share of programme','Cumulative work','Cost incurred','Valuation','Advance recovery','Retention held','Certified net','Client payment','Retention release','Advance received','LDs','Contractor cash flow']
def tf(t,c,p,R):
    m=f"{c}$3";first=t==0;CON=f"(SUM(BOQ!$E$2:$E$8)*(1+{I['markup']})*(1+{I['co']}))"
    d={'Month':t,'Date':f"EOMONTH({I['start']},{m})",'Share of programme':f"MIN(1,{m}/{PM})",
     'Cumulative work':f"INDEX(Curve!$B$2:$B$12,MATCH(FLOOR({c}{R['Share of programme']}*10,1)/10,Curve!$A$2:$A$12,0))+IF({c}{R['Share of programme']}<1,(INDEX(Curve!$B$2:$B$12,MATCH(FLOOR({c}{R['Share of programme']}*10,1)/10,Curve!$A$2:$A$12,0)+1)-INDEX(Curve!$B$2:$B$12,MATCH(FLOOR({c}{R['Share of programme']}*10,1)/10,Curve!$A$2:$A$12,0)))*({c}{R['Share of programme']}*10-FLOOR({c}{R['Share of programme']}*10,1)),0)",
     'Cost incurred':'0' if first else f"SUM(BOQ!$E$2:$E$8)*(1+{I['co']})*({c}{R['Cumulative work']}-{p}{R['Cumulative work']})",
     'Valuation':'0' if first else f"{CON}*({c}{R['Cumulative work']}-{p}{R['Cumulative work']})",
     'Advance recovery':f"{c}{R['Valuation']}*{I['adv']}",'Retention held':f"{c}{R['Valuation']}*{I['ret']}",
     'Certified net':f"{c}{R['Valuation']}-{c}{R['Advance recovery']}-{c}{R['Retention held']}",
     'Client payment':'0' if first else f"IF({m}>ROUNDUP({I['days']}/30,0),OFFSET({c}{R['Certified net']},0,-ROUNDUP({I['days']}/30,0)),0)",
     'Retention release':f"IF({m}={PM},SUM($B${R['Retention held']}:{c}{R['Retention held']})/2,0)+IF({m}={PM}+{I['dlp']},SUM($B${R['Retention held']}:${L(T+2)}${R['Retention held']})/2,0)",
     'Advance received':f"IF({m}=0,{CON}*{I['adv']},0)",
     'LDs':f"IF({m}={PM},MIN({I['ldcap']},{I['ld']}*{I['delay']})*{CON},0)",
     'Contractor cash flow':f"{c}{R['Client payment']}+{c}{R['Retention release']}+{c}{R['Advance received']}-{c}{R['Cost incurred']}-{c}{R['LDs']}"}
    return d
R=timeline(cf,labs,T,tf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
cf.cell(R['Contractor cash flow']+1,1,'Cumulative cash')
for t in range(T+1):cf[f'{L(t+2)}{R["Contractor cash flow"]+1}']=f"=SUM($B${R['Contractor cash flow']}:{L(t+2)}{R['Contractor cash flow']})"
table(wb.create_sheet('Returns'),[('Contract sum (AED)',"=SUM(BOQ!$E$2:$E$8)*(1+Inputs!$B$5)*(1+Inputs!$B$12)",N),('Margin (AED)',f"=SUM({row('Contractor cash flow')})",N),('Margin on contract',"=B4/B3",P),
 ('Peak negative cash (AED)',f"=-MIN('Cash Flow'!$B${R['Contractor cash flow']+1}:${E}${R['Contractor cash flow']+1})",N),('NPV of the contract (AED)',f"=NPV((1+{I['wacc']})^(1/12)-1,{row('Contractor cash flow')})",N),
 ('LDs (AED)',f"=SUM({row('LDs')})",N),('Structure and envelope cost (AED)',"=SUMPRODUCT(((BOQ!$D$2:$D$8=\"Structure\")+(BOQ!$D$2:$D$8=\"Envelope\")>0)*BOQ!$E$2:$E$8)",N),('Net profit (AED)',"=B4",N)])
wb.save(OUT+'tender_aed.xlsx')
print('ok')

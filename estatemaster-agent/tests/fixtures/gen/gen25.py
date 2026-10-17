# round 25: a CIO's desk on new ground again
#  hotel    - JPY Tokyo business hotel, monthly 10 years: seasonality by CHOOSE(MONTH()), occupancy ramp, ADR growth, GOP, a base fee
#             and an incentive fee over an owner's priority, FF&E reserve, a TMK-style loan, figures in hundreds of millions of yen
#  mf       - USD multifamily held in $000s: the model's amounts are in thousands; LP/GP waterfall with an 8% pref, 70/30 to a 15% IRR
#             hurdle then 50/50, accounting number formats with negatives in brackets
#  logi     - EUR logistics portfolio, quarterly: eight warehouses on a sheet, CPI by country through a 2D INDEX/MATCH, rent-free
#             quarters, SUMPRODUCT by region, a text scenario switch ("Base"/"Downside") through MATCH, XIRR on quarter-end dates
#  ppp      - SAR hospital PPP: availability payment less KPI deductions, sculpted repayment to a target DSCR, a six-month DSRA,
#             LLCR by NPV, zakat
#  hmo      - GBP student HMO conversion, a small developer's sheet: growth typed as 4 in a cell formatted 0.0"%" (used /100),
#             a cost typed as text "1,250" read by VALUE, merged title, a hidden sheet of constants
import openpyxl,os,datetime
from openpyxl.utils import get_column_letter as L
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m25/'
os.makedirs(OUT,exist_ok=True)
P='0.00%';N='#,##0';X='0.00"x"';D='dd-mmm-yyyy';ACC='_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';JPY='"¥"#,##0'
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

# ================= 25A Tokyo hotel (JPY) =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='SHINAGAWA BAY HOTEL – BUSINESS HOTEL, MONTHLY (JPY)'
I=inputs(ws,[('start','Model start',datetime.date(2026,12,31),D),('keys','Rooms',412,N),('adr','ADR, year 1 (¥)',18500,JPY),('adrg','ADR growth a year',0.025,P),('occ','Stabilised occupancy',0.84,P),
 ('ramp','Ramp-up (months)',18,'0'),('fb','F&B and other revenue share',0.12,P),('dept','Departmental costs share of revenue',0.31,P),('und','Undistributed costs a month (¥)',62000000,JPY),
 ('base','Base management fee',0.025,P),('inc','Incentive fee over the owner priority',0.08,P),('prio','Owner priority a year (¥)',1450000000,JPY),('ffe','FF&E reserve',0.04,P),
 ('price','Purchase price (¥)',21500000000,JPY),('ltv','Loan to value',0.55,P),('rate','Loan rate',0.0135,P),('xy','Exit cap rate',0.042,P)])
sz=wb.create_sheet('Seasonality');sz.append(['Month','Occupancy factor'])
for m,f in enumerate([0.86,0.92,1.04,1.08,1.02,0.97,1.03,1.09,1.0,1.06,1.03,0.9],1):sz.append([m,f])
cf=wb.create_sheet('Cash Flow');T=120
labs=['Month','Date','Occupancy','ADR','Rooms revenue','Total revenue','Departmental costs','Undistributed costs','GOP','Base fee','Incentive fee','FF&E reserve','NOI','Interest','Equity cash flow']
def hf(t,c,p,R):
    m=f"{c}$3";first=t==0
    d={'Month':t,'Date':f"EOMONTH({I['start']},{m})"}
    d['Occupancy']='0' if first else f"{I['occ']}*MIN(1,0.55+0.45*{m}/{I['ramp']})*CHOOSE(MONTH({c}{R['Date']}),"+",".join(f"Seasonality!$B${k+1}" for k in range(1,13))+")"
    d['ADR']=f"ROUND({I['adr']}*(1+{I['adrg']})^INT(({m}-1)/12),-1)"
    d['Rooms revenue']='0' if first else f"{I['keys']}*DAY({c}{R['Date']})*{c}{R['Occupancy']}*{c}{R['ADR']}"
    d['Total revenue']=f"{c}{R['Rooms revenue']}/(1-{I['fb']})"
    d['Departmental costs']=f"{c}{R['Total revenue']}*{I['dept']}"
    d['Undistributed costs']='0' if first else f"{I['und']}*(1+{I['adrg']})^INT(({m}-1)/12)"
    d['GOP']=f"{c}{R['Total revenue']}-{c}{R['Departmental costs']}-{c}{R['Undistributed costs']}"
    d['Base fee']=f"{c}{R['Total revenue']}*{I['base']}"
    d['Incentive fee']=f"MAX(0,{c}{R['GOP']}-{c}{R['Base fee']}-{I['prio']}/12)*{I['inc']}"
    d['FF&E reserve']=f"{c}{R['Total revenue']}*{I['ffe']}"
    d['NOI']=f"{c}{R['GOP']}-{c}{R['Base fee']}-{c}{R['Incentive fee']}-{c}{R['FF&E reserve']}"
    d['Interest']='0' if first else f"{I['price']}*{I['ltv']}*{I['rate']}/12"
    d['Equity cash flow']=f"-{I['price']}*(1-{I['ltv']})" if first else f"{c}{R['NOI']}-{c}{R['Interest']}+IF({m}={T},SUM({L(max(2,t-9))}{R['NOI']}:{c}{R['NOI']})/{I['xy']}-{I['price']}*{I['ltv']},0)"
    return d
R=timeline(cf,labs,T,hf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
for n in ['Rooms revenue','Total revenue','GOP','NOI','Equity cash flow']:
    for t in range(T+1):cf[f'{L(t+2)}{R[n]}'].number_format=JPY
table(wb.create_sheet('Returns'),[('Levered IRR',f"=(1+IRR({row('Equity cash flow')},0.005))^12-1",P),('Stabilised RevPAR, year 3 (¥)',f"=SUM('Cash Flow'!$Z${R['Rooms revenue']}:$AK${R['Rooms revenue']})/({I['keys']}*365)",JPY),
 ('Average occupancy',f"=AVERAGE('Cash Flow'!$C${R['Occupancy']}:${E}${R['Occupancy']})",P),('GOP margin',f"=SUM({row('GOP')})/SUM({row('Total revenue')})",P),
 ('Incentive fees paid (¥)',f"=SUM({row('Incentive fee')})",JPY),('Exit value (¥)',f"=SUM('Cash Flow'!${L(T-9)}${R['NOI']}:${E}${R['NOI']})/{I['xy']}",JPY),('Net profit (¥)',f"=SUM({row('Equity cash flow')})",JPY)])
wb.save(OUT+'hotel_jpy.xlsx')

# ================= 25B multifamily in $000s, LP/GP waterfall =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Assumptions';ws['A1']='CEDAR HOLLOW APARTMENTS – VALUE-ADD MULTIFAMILY ($000s)'
I=inputs(ws,[('units','Units',286,N),('rent','Average rent per unit a month ($)',1840,N),('prem','Renovation premium per unit a month ($)',165,N),('reno','Units renovated a year',72,N),('rcost','Renovation cost per unit ($000s)',14.5,'#,##0.0'),
 ('rg','Rent growth',0.03,P),('vac','Vacancy and credit loss',0.06,P),('opex','Operating expenses a unit a year ($)',6400,N),('og','Expense growth',0.028,P),('price','Purchase price ($000s)',58500,ACC),
 ('loan','Loan ($000s)',38000,ACC),('rate','Loan rate',0.0585,P),('xy','Exit cap rate',0.0575,P),('cost','Selling costs',0.015,P),('lp','LP share of equity',0.9,P),('pref','Preferred return',0.08,P),
 ('hurd','IRR hurdle for the second split',0.15,P),('s1','GP promote to the hurdle',0.3,P),('s2','GP promote above the hurdle',0.5,P)],start=3)
cf=wb.create_sheet('Cash Flow');T=5
labs=['Year','Renovated units','Gross potential rent','Effective rent','Operating expenses','NOI','Renovation capex','Debt service','Sale proceeds','Project cash flow',
 'LP pref balance','LP to pref','LP 8% hurdle met','LP 15% balance','Split 1 cash','Split 2 cash','LP cash flow','GP cash flow']
def wf(t,c,p,R):
    y=f"{c}$3";first=t==0
    d={'Year':t,'Renovated units':'0' if first else f"MIN({I['units']},{y}*{I['reno']})"}
    d['Gross potential rent']='0' if first else f"({I['units']}*{I['rent']}+{c}{R['Renovated units']}*{I['prem']})*12*(1+{I['rg']})^({y}-1)/1000"
    d['Effective rent']=f"{c}{R['Gross potential rent']}*(1-{I['vac']})"
    d['Operating expenses']='0' if first else f"{I['units']}*{I['opex']}*(1+{I['og']})^({y}-1)/1000"
    d['NOI']=f"{c}{R['Effective rent']}-{c}{R['Operating expenses']}"
    d['Renovation capex']='0' if first else f"({c}{R['Renovated units']}-{p}{R['Renovated units']})*{I['rcost']}"
    d['Debt service']='0' if first else f"{I['loan']}*{I['rate']}"
    d['Sale proceeds']=f"IF({y}={T},({c}{R['NOI']}*(1+{I['rg']})/{I['xy']})*(1-{I['cost']})-{I['loan']},0)"
    d['Project cash flow']=f"-({I['price']}-{I['loan']})" if first else f"{c}{R['NOI']}-{c}{R['Renovation capex']}-{c}{R['Debt service']}+{c}{R['Sale proceeds']}"
    # tier 1: LP and GP pro rata until the LP has its pref (balance compounding at the pref); tier 2: split 1 until the LP's 15% balance is met; tier 3: split 2
    lpin=f"-{c}{R['Project cash flow']}*{I['lp']}"
    d['LP pref balance']=f"{lpin}" if first else f"{p}{R['LP pref balance']}*(1+{I['pref']})-{p}{R['LP to pref']}"
    d['LP to pref']='0' if first else f"MIN({c}{R['LP pref balance']}*(1+{I['pref']}),MAX(0,{c}{R['Project cash flow']})*{I['lp']})"
    d['LP 8% hurdle met']='0' if first else f"IF({c}{R['LP to pref']}>={c}{R['LP pref balance']}*(1+{I['pref']})-0.001,1,0)"
    d['LP 15% balance']=f"{lpin}" if first else f"MAX(0,{p}{R['LP 15% balance']}*(1+{I['hurd']})-{p}{R['LP to pref']}-{p}{R['Split 1 cash']}*(1-{I['s1']}))"
    rem=f"MAX(0,{c}{R['Project cash flow']}-{c}{R['LP to pref']}/{I['lp']})"
    d['Split 1 cash']='0' if first else f"MIN({rem},MAX(0,{c}{R['LP 15% balance']}*(1+{I['hurd']})-{c}{R['LP to pref']})/(1-{I['s1']}))"
    d['Split 2 cash']='0' if first else f"{rem}-{c}{R['Split 1 cash']}"
    d['LP cash flow']=f"{c}{R['Project cash flow']}*{I['lp']}" if first else f"{c}{R['LP to pref']}+{c}{R['Split 1 cash']}*(1-{I['s1']})+{c}{R['Split 2 cash']}*(1-{I['s2']})"
    d['GP cash flow']=f"{c}{R['Project cash flow']}*(1-{I['lp']})" if first else f"{c}{R['Project cash flow']}-{c}{R['LP cash flow']}"
    return d
R=timeline(cf,labs,T,wf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
for n in labs[1:]:
    for t in range(T+1):cf[f'{L(t+2)}{R[n]}'].number_format=ACC
table(wb.create_sheet('Returns'),[('Project IRR',f"=IRR({row('Project cash flow')})",P),('LP net IRR',f"=IRR({row('LP cash flow')})",P),('GP IRR',f"=IRR({row('GP cash flow')})",P),
 ('LP equity multiple',f"=SUM('Cash Flow'!$C${R['LP cash flow']}:${E}${R['LP cash flow']})/-'Cash Flow'!$B${R['LP cash flow']}",X),
 ('GP promote ($000s)',f"=SUM({row('GP cash flow')})-SUM({row('Project cash flow')})*(1-{I['lp']})",ACC),('Exit value ($000s)',f"='Cash Flow'!${E}${R['Sale proceeds']}+{I['loan']}",ACC),
 ('Net profit ($000s)',f"=SUM({row('Project cash flow')})",ACC),('Year-1 debt yield',f"='Cash Flow'!C{R['NOI']}/{I['loan']}",P)])
wb.save(OUT+'mf_usd.xlsx')

# ================= 25C logistics portfolio, quarterly, scenario switch =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='NORDHAFEN LOGISTICS PORTFOLIO – QUARTERLY (EUR)'
I=inputs(ws,[('scen','Scenario','Base','@'),('start','Model start',datetime.date(2026,12,31),D),('price','Portfolio price (EUR)',318000000,N),('xy','Exit yield',0.0525,P),('opex','Non-recoverable costs share',0.045,P),
 ('voidq','Re-letting void (quarters)',2,'0'),('erv','ERV uplift on re-letting',0.08,P)])
ws['D3']='Allowed: Base, Downside';sc=wb.create_sheet('Scenarios');sc.append(['Scenario','CPI shift','Void shift (quarters)','Exit yield shift'])
sc.append(['Base',0,0,0]);sc.append(['Downside',-0.01,2,0.0075])
cp=wb.create_sheet('CPI');cp.append(['Country',2027,2028,2029,2030,2031,2032,2033])
for row_ in [('DE',0.022,0.021,0.02,0.02,0.02,0.02,0.02),('NL',0.026,0.024,0.022,0.021,0.02,0.02,0.02),('PL',0.041,0.035,0.031,0.029,0.027,0.026,0.025),('CZ',0.033,0.029,0.026,0.025,0.024,0.023,0.022)]:cp.append(list(row_))
wh=wb.create_sheet('Warehouses');wh.append(['Asset','Country','Region','Area (sqm)','Rent (EUR/sqm/yr)','Lease expiry','Rent-free quarters'])
for row_ in [('Hamburg Süd','DE','North',62000,78,datetime.date(2031,6,30),0),('Bremen GVZ','DE','North',41000,72,datetime.date(2028,12,31),1),('Duisburg Logport','DE','West',55000,81,datetime.date(2033,3,31),0),
             ('Venlo','NL','West',48000,84,datetime.date(2029,9,30),2),('Tilburg','NL','West',36000,79,datetime.date(2032,12,31),0),('Poznań','PL','East',71000,48,datetime.date(2030,3,31),1),
             ('Wrocław','PL','East',52000,46,datetime.date(2027,12,31),0),('Brno','CZ','East',39000,55,datetime.date(2031,12,31),1)]:wh.append(list(row_))
for r in range(2,10):wh.cell(r,6).number_format=D
cf=wb.create_sheet('Cash Flow');T=28
sw=f"MATCH({I['scen']},Scenarios!$A$2:$A$3,0)"
labs=['Quarter','Date','Year']+[f'Rent {k}' for k in range(1,9)]+['Gross rent','Costs','NOI','Cash flow']
def lf(t,c,p,R):
    q=f"{c}$3";first=t==0
    d={'Quarter':t,'Date':f"EOMONTH({I['start']},3*{q})",'Year':f"MIN(2033,MAX(2027,YEAR({c}{R['Date']})))"}
    for k in range(1,9):
        r=k+1;cpi=f"(INDEX(CPI!$B$2:$H$5,MATCH(Warehouses!$B${r},CPI!$A$2:$A$5,0),MATCH({c}{R['Year']},CPI!$B$1:$H$1,0))+INDEX(Scenarios!$B$2:$B$3,{sw}))"
        exp=f"Warehouses!$F${r}";dt=f"{c}{R['Date']}";vq=f"({I['voidq']}+INDEX(Scenarios!$C$2:$C$3,{sw}))"
        base=f"Warehouses!$D${r}*Warehouses!$E${r}/4*(1+{cpi})^({q}/4)"
        d[f'Rent {k}']='0' if first else f"IF({q}<=Warehouses!$G${r},0,IF({dt}<={exp},{base},IF({dt}<=EOMONTH({exp},3*{vq}),0,{base}*(1+{I['erv']}))))"
    d['Gross rent']="+".join(f"{c}{R[f'Rent {k}']}" for k in range(1,9))
    d['Costs']=f"{c}{R['Gross rent']}*{I['opex']}"
    d['NOI']=f"{c}{R['Gross rent']}-{c}{R['Costs']}"
    d['Cash flow']=f"-{I['price']}" if first else f"{c}{R['NOI']}+IF({q}={T},SUM({L(max(2,t-1))}{R['NOI']}:{c}{R['NOI']})/({I['xy']}+INDEX(Scenarios!$D$2:$D$3,{sw})),0)"
    return d
R=timeline(cf,labs,T,lf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
table(wb.create_sheet('Returns'),[('Unlevered IRR',f"=XIRR({row('Cash flow')},{row('Date')})",P),('Net initial yield',f"=SUM('Cash Flow'!$C${R['NOI']}:$F${R['NOI']})/{I['price']}",P),
 ('Area in the North (sqm)',"=SUMPRODUCT((Warehouses!$C$2:$C$9=\"North\")*Warehouses!$D$2:$D$9)",N),('Rent from the East a year (EUR)',"=SUMPRODUCT((Warehouses!$C$2:$C$9=\"East\")*Warehouses!$D$2:$D$9*Warehouses!$E$2:$E$9)",N),
 ('WAULT (years)',f"=SUMPRODUCT(Warehouses!$D$2:$D$9*Warehouses!$E$2:$E$9,(Warehouses!$F$2:$F$9-{I['start']})/365.25)/SUMPRODUCT(Warehouses!$D$2:$D$9,Warehouses!$E$2:$E$9)",'0.0'),
 ('Net profit (EUR)',f"=SUM({row('Cash flow')})",N)])
wb.save(OUT+'logi_eur.xlsx')

# ================= 25D hospital PPP, sculpted debt =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='AL MURJAN HOSPITAL PPP – AVAILABILITY-BASED (SAR)'
I=inputs(ws,[('ap','Availability payment, year 1 (SAR)',265000000,N),('idx','Indexation',0.02,P),('kpi','KPI deductions share',0.015,P),('fm','Facilities management a year (SAR)',72000000,N),('lc','Lifecycle a year (SAR)',18000000,N),
 ('capex','Construction cost (SAR)',1950000000,N),('gear','Gearing',0.82,P),('rate','Senior rate',0.055,P),('tgt','Target DSCR',1.3,X),('tenor','Debt tenor (years)',22,'0'),('term','Operating term (years)',25,'0'),
 ('dsra','DSRA, months of debt service',6,'0'),('zak','Zakat rate',0.025,P),('disc','Discount rate for LLCR',0.055,P)])
cf=wb.create_sheet('Cash Flow');T=25
labs=['Year','Availability payment','Deductions','Revenue','FM','Lifecycle','CFADS','Opening debt','Interest','Repayment','Closing debt','DSCR','DSRA balance','DSRA movement','Zakat','Equity cash flow']
def pf(t,c,p,R):
    y=f"{c}$3";first=t==0
    d={'Year':t,'Availability payment':'0' if first else f"IF({y}<={I['term']},{I['ap']}*(1+{I['idx']})^({y}-1),0)"}
    d['Deductions']=f"{c}{R['Availability payment']}*{I['kpi']}";d['Revenue']=f"{c}{R['Availability payment']}-{c}{R['Deductions']}"
    d['FM']='0' if first else f"IF({y}<={I['term']},{I['fm']}*(1+{I['idx']})^({y}-1),0)";d['Lifecycle']='0' if first else f"IF({y}<={I['term']},{I['lc']}*(1+{I['idx']})^({y}-1),0)"
    d['CFADS']=f"{c}{R['Revenue']}-{c}{R['FM']}-{c}{R['Lifecycle']}"
    d['Opening debt']=f"{I['capex']}*{I['gear']}" if first else f"{p}{R['Closing debt']}"
    d['Interest']='0' if first else f"{c}{R['Opening debt']}*{I['rate']}"
    d['Repayment']='0' if first else f"IF({y}<{I['tenor']},MIN({c}{R['Opening debt']},MAX(0,{c}{R['CFADS']}/{I['tgt']}-{c}{R['Interest']})),IF({y}={I['tenor']},{c}{R['Opening debt']},0))"
    d['Closing debt']=f"{c}{R['Opening debt']}-{c}{R['Repayment']}"
    d['DSCR']=f"IF({c}{R['Interest']}+{c}{R['Repayment']}>0,{c}{R['CFADS']}/({c}{R['Interest']}+{c}{R['Repayment']}),0)"
    nx=L(t+3)
    d['DSRA balance']=f"0" if t==T else f"({nx}{R['Opening debt']}*{I['rate']}+IF({nx}$3<{I['tenor']},MIN({nx}{R['Opening debt']},MAX(0,{nx}{R['CFADS']}/{I['tgt']}-{nx}{R['Opening debt']}*{I['rate']})),IF({nx}$3={I['tenor']},{nx}{R['Opening debt']},0)))*{I['dsra']}/12"
    d['DSRA movement']=f"{c}{R['DSRA balance']}" if first else f"{c}{R['DSRA balance']}-{p}{R['DSRA balance']}"
    d['Zakat']=f"MAX(0,{c}{R['CFADS']}-{c}{R['Interest']})*{I['zak']}"
    d['Equity cash flow']=f"-{I['capex']}*(1-{I['gear']})-{c}{R['DSRA movement']}" if first else f"{c}{R['CFADS']}-{c}{R['Interest']}-{c}{R['Repayment']}-{c}{R['DSRA movement']}-{c}{R['Zakat']}"
    return d
R=timeline(cf,labs,T,pf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Equity IRR',f"=IRR({row('Equity cash flow')})",P),('Minimum DSCR',f"=_xlfn.MINIFS({row('DSCR')},{row('DSCR')},\">0\")",X),
 ('LLCR at financial close',f"=NPV({I['disc']},'Cash Flow'!$C${R['CFADS']}:${L(2+22)}${R['CFADS']})/'Cash Flow'!$B${R['Opening debt']}",X),('Peak DSRA (SAR)',f"=MAX({row('DSRA balance')})",N),
 ('Debt outstanding at maturity (SAR)',f"=INDEX({row('Closing debt')},{I['tenor']}+1)",N),('Zakat over the term (SAR)',f"=SUM({row('Zakat')})",N),('Net profit (SAR)',f"=SUM({row('Equity cash flow')})",N)])
wb.save(OUT+'ppp_sar.xlsx')

# ================= 25E small developer's HMO sheet (percent typed as whole numbers, text numbers, hidden sheet) =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Appraisal'
ws.merge_cells('A1:D1');ws['A1']='14 CLARENDON ROAD – STUDENT HMO CONVERSION (GBP)'
rows=[('Purchase price (£)',465000,N),('Bedrooms',9,'0'),('Rent per room a week (£)',148,N),('Weeks let a year',46,'0'),('Rent growth a year',4,'0.0"%"'),('Bills and management (% of rent)',22,'0.0"%"'),
      ('Conversion cost per room (£)','1,250',None),('Main works (£)',138000,N),('Mortgage LTV',75,'0"%"'),('Mortgage rate',5.4,'0.00"%"'),('Exit yield',6.5,'0.0"%"'),('Hold (years)',5,'0')]
for i,(lab,v,f) in enumerate(rows,3):
    ws.cell(i,1,lab);c=ws.cell(i,2,v)
    if f:c.number_format=f
hs=wb.create_sheet('k');hs['A1']='Stamp duty, higher rate';hs['B1']=0.05;hs['A2']='Legal and survey (£)';hs['B2']=6500;hs.sheet_state='hidden'
cf=wb.create_sheet('Cash Flow');T=5
labs=['Year','Rent','Bills and management','Mortgage interest','Capital costs','Sale','Equity cash flow']
def mf(t,c,p,R):
    y=f"{c}$3";first=t==0
    d={'Year':t,'Rent':'0' if first else f"IF({y}<=Appraisal!$B$14,Appraisal!$B$4*Appraisal!$B$5*Appraisal!$B$6*(1+Appraisal!$B$7/100)^({y}-1),0)"}
    d['Bills and management']=f"{c}{R['Rent']}*Appraisal!$B$8/100"
    d['Mortgage interest']='0' if first else f"IF({y}<=Appraisal!$B$14,(Appraisal!$B$3+Appraisal!$B$10+VALUE(Appraisal!$B$9)*Appraisal!$B$4)*Appraisal!$B$11/100*Appraisal!$B$12/100,0)"
    d['Capital costs']=f"Appraisal!$B$3*(1+k!$B$1)+k!$B$2+Appraisal!$B$10+VALUE(Appraisal!$B$9)*Appraisal!$B$4" if first else '0'
    d['Sale']=f"IF({y}=Appraisal!$B$14,({c}{R['Rent']}-{c}{R['Bills and management']})*(1+Appraisal!$B$7/100)/(Appraisal!$B$13/100)-(Appraisal!$B$3+Appraisal!$B$10+VALUE(Appraisal!$B$9)*Appraisal!$B$4)*Appraisal!$B$11/100,0)"
    d['Equity cash flow']=(f"-{c}{R['Capital costs']}*(1-Appraisal!$B$11/100)" if first else f"{c}{R['Rent']}-{c}{R['Bills and management']}-{c}{R['Mortgage interest']}+{c}{R['Sale']}")
    return d
R=timeline(cf,labs,T,mf);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
rs=wb.create_sheet('Returns')
table(rs,[('Equity IRR',f"=IRR({row('Equity cash flow')})",P),('Gross yield on cost',f"='Cash Flow'!C{R['Rent']}/'Cash Flow'!B{R['Capital costs']}",P),('Total cost (£)',f"='Cash Flow'!B{R['Capital costs']}",N),
 ('Cash on cash, year 1',f"=('Cash Flow'!C{R['Rent']}-'Cash Flow'!C{R['Bills and management']}-'Cash Flow'!C{R['Mortgage interest']})/-'Cash Flow'!B{R['Equity cash flow']}",P),('Net profit (£)',f"=SUM({row('Equity cash flow')})",N)])
wb.save(OUT+'hmo_gbp.xlsx')
print('ok')

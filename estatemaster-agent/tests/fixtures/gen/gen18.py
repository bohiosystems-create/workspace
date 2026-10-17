# round 18: harder models
# The JV model is circular: LibreOffice does not converge on it, so its stored results are written by jvsim18.py (an independent
# implementation of the same model): python3 jvsim18.py fixture <out>/jv_usd.xlsx r18_jv_usd.xlsx
#  jv      - US build-to-sell condo JV, monthly, S-curve hard costs, construction loan with capitalised interest and a fee on the
#            facility (circular), equity first, three-tier IRR-hurdle waterfall (8% / 15%) with LP / GP IRRs
#  mixed   - Saudi phased mixed use, scenario table (Base / Downside / Upside) chosen by CHOOSE, phase start years, RETT on land,
#            zakat on positive profit, murabaha, NPV at a discount rate
#  hotels  - Iberian hotel portfolio: three hotel sheets with the same labels, a portfolio sheet that consolidates, debt and exit
#  sculpt  - UK long-income with a sculpted loan: debt service = CFADS / target DSCR, debt = NPV of it, LLCR, CPI collar
#  fx      - Warsaw logistics: rent in EUR, costs in PLN, EUR/PLN rate, results in EUR
#  indir   - UK retail park whose live case is picked with INDIRECT (a function the engine may not have)
import openpyxl,os,math
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.defined_name import DefinedName
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m18/';os.makedirs(OUT+'calc',exist_ok=True)
P='0.00%';N='#,##0';N2='#,##0.00';X='0.00"x"'
def ref(ws,col,r):return (f"'{ws.title}'" if ' ' in ws.title else ws.title)+f"!${L(col)}${r}"
def inputs(ws,rows,col=2,start=3):
    I={};r=start
    for k,lab,v,f in rows:
        ws.cell(r,1,lab);c=ws.cell(r,col,v);c.number_format=f;I[k]=ref(ws,col,r);r+=1
    return I
def table(ws,rows,start=3,col=2):
    for i,(lab,f,fm) in enumerate(rows):ws.cell(start+i,1,lab);c=ws.cell(start+i,col,f);c.number_format=fm

# ---------- JV condo, monthly, circular, waterfall ----------
wb=openpyxl.Workbook();wb.calculation.iterate=True;wb.calculation.iterateCount=1000;wb.calculation.iterateDelta=0.001
ws=wb.active;ws.title='Assumptions';ws['A1']='HARBOR POINT CONDOMINIUMS – JV DEVELOPMENT (USD)'
I=inputs(ws,[('units','Units',240,N),('price','Average sale price ($ per unit)',650000,N),('sstart','Sales start (month)',24,'0'),('pace','Sales pace (units per month)',10,'0'),
 ('sell','Selling costs',0.03,P),('land','Land ($)',18000000,N),('hard','Hard costs ($)',72000000,N),('hstart','Construction start (month)',3,'0'),('soft','Soft costs (% of hard)',0.12,P),
 ('cont','Contingency (% of hard)',0.05,P),('ltc','Loan to cost',0.6,P),('rate','Construction loan interest rate',0.075,P),('fee','Arrangement fee (% of facility)',0.01,P),
 ('lp','LP share of equity',0.9,P),('h1','Preferred return (tier 1 hurdle)',0.08,P),('h2','Tier 2 hurdle IRR',0.15,P),('s2','LP share above tier 1',0.75,P),('s3','LP share above tier 2',0.6,P)])
cv=wb.create_sheet('Curve');cv['A1']='Month of build';cv['B1']='Share of hard cost'
w=[math.sin(math.pi*(i+0.5)/24) for i in range(24)];sw=sum(w)
for i in range(24):cv.cell(i+2,1,i+1);c=cv.cell(i+2,2,round(w[i]/sw,8));c.number_format='0.0000%'
cv.cell(26,1,'Total');cv.cell(26,2,'=SUM(B2:B25)')
cf=wb.create_sheet('Cash Flow');T=48
lab=['Month','Land','Hard costs','Soft costs','Contingency','Arrangement fee','Interest (capitalised)','Total cost','Cumulative cost','Equity drawn','Cumulative equity','Debt drawn',
 'Units sold','Net sales revenue','Loan repayment','Loan balance','Distributions to equity','Equity cash flow','Unlevered cash flow',
 'LP contribution','Tier 1 account (opening + growth)','Tier 1 distribution','LP tier 1','Tier 2 account (opening + growth)','Tier 2 distribution','LP tier 2','Above tier 2','LP total','LP cash flow','GP cash flow','Tier 1 account (closing)','Tier 2 account (closing)','Cumulative units sold']
R={l:i+3 for i,l in enumerate(lab)}
for l,r in R.items():cf.cell(r,1,l)
A=I
facility=f"{A['ltc']}*SUM($B${R['Total cost']}:${L(T+1)}${R['Total cost']})"
eqcap=f"(1-{A['ltc']})*SUM($B${R['Total cost']}:${L(T+1)}${R['Total cost']})"
m1=f"((1+{A['h1']})^(1/12)-1)";m2=f"((1+{A['h2']})^(1/12)-1)"
for t in range(T):
    c=L(t+2);p=L(t+1);first=t==0
    def g(name,expr):cf[f'{c}{R[name]}']='='+expr
    g('Month',str(t)) if False else None;cf[f'{c}{R["Month"]}']=t
    g('Land',f"IF({c}${R['Month']}=0,{A['land']},0)")
    g('Hard costs',f"IF(AND({c}${R['Month']}>={A['hstart']},{c}${R['Month']}<{A['hstart']}+24),{A['hard']}*INDEX(Curve!$B$2:$B$25,{c}${R['Month']}-{A['hstart']}+1),0)")
    g('Soft costs',f"{c}{R['Hard costs']}*{A['soft']}");g('Contingency',f"{c}{R['Hard costs']}*{A['cont']}")
    g('Arrangement fee',f"IF({c}${R['Month']}=0,{A['fee']}*{facility},0)")
    g('Interest (capitalised)','0' if first else f"{p}{R['Loan balance']}*{A['rate']}/12")
    g('Total cost',f"SUM({c}{R['Land']}:{c}{R['Interest (capitalised)']})")
    g('Cumulative cost',f"{c}{R['Total cost']}" if first else f"{p}{R['Cumulative cost']}+{c}{R['Total cost']}")
    g('Equity drawn',f"MIN({c}{R['Total cost']},MAX(0,{eqcap}-{'0' if first else p+str(R['Cumulative equity'])}))")
    g('Cumulative equity',f"{c}{R['Equity drawn']}" if first else f"{p}{R['Cumulative equity']}+{c}{R['Equity drawn']}")
    g('Debt drawn',f"{c}{R['Total cost']}-{c}{R['Equity drawn']}")
    g('Units sold',f"IF({c}${R['Month']}>={A['sstart']},MIN({A['pace']},{A['units']}-{'0' if first else p+str(R['Cumulative units sold'])}),0)")
    g('Cumulative units sold',f"{c}{R['Units sold']}" if first else f"{p}{R['Cumulative units sold']}+{c}{R['Units sold']}")
    g('Net sales revenue',f"{c}{R['Units sold']}*{A['price']}*(1-{A['sell']})")
    pb='0' if first else f"{p}{R['Loan balance']}"
    g('Loan repayment',f"MIN({c}{R['Net sales revenue']},{pb}+{c}{R['Debt drawn']})")
    g('Loan balance',f"{pb}+{c}{R['Debt drawn']}-{c}{R['Loan repayment']}")
    g('Distributions to equity',f"{c}{R['Net sales revenue']}-{c}{R['Loan repayment']}")
    g('Equity cash flow',f"{c}{R['Distributions to equity']}-{c}{R['Equity drawn']}")
    g('Unlevered cash flow',f"{c}{R['Net sales revenue']}-({c}{R['Land']}+{c}{R['Hard costs']}+{c}{R['Soft costs']}+{c}{R['Contingency']})")
    g('LP contribution',f"{c}{R['Equity drawn']}*{A['lp']}")
    g('Tier 1 account (opening + growth)',f"{'0' if first else p+str(R['Tier 1 account (closing)'])}*(1+{m1})+{c}{R['LP contribution']}")
    g('Tier 1 distribution',f"MIN({c}{R['Distributions to equity']},{c}{R['Tier 1 account (opening + growth)']}/{A['lp']})")
    g('LP tier 1',f"{c}{R['Tier 1 distribution']}*{A['lp']}")
    g('Tier 1 account (closing)',f"{c}{R['Tier 1 account (opening + growth)']}-{c}{R['LP tier 1']}")
    g('Tier 2 account (opening + growth)',f"{'0' if first else p+str(R['Tier 2 account (closing)'])}*(1+{m2})+{c}{R['LP contribution']}")
    g('Tier 2 distribution',f"MIN({c}{R['Distributions to equity']}-{c}{R['Tier 1 distribution']},MAX(0,{c}{R['Tier 2 account (opening + growth)']}-{c}{R['LP tier 1']})/{A['s2']})")
    g('LP tier 2',f"{c}{R['Tier 2 distribution']}*{A['s2']}")
    g('Tier 2 account (closing)',f"MAX(0,{c}{R['Tier 2 account (opening + growth)']}-{c}{R['LP tier 1']}-{c}{R['LP tier 2']})")
    g('Above tier 2',f"{c}{R['Distributions to equity']}-{c}{R['Tier 1 distribution']}-{c}{R['Tier 2 distribution']}")
    g('LP total',f"{c}{R['LP tier 1']}+{c}{R['LP tier 2']}+{c}{R['Above tier 2']}*{A['s3']}")
    g('LP cash flow',f"{c}{R['LP total']}-{c}{R['LP contribution']}")
    g('GP cash flow',f"{c}{R['Equity cash flow']}-{c}{R['LP cash flow']}")
E=L(T+1);row=lambda n:f"'Cash Flow'!B{R[n]}:{E}{R[n]}"
rs=wb.create_sheet('Returns');table(rs,[('Unlevered IRR',f"=(1+IRR({row('Unlevered cash flow')},0.01))^12-1",P),('Levered IRR',f"=(1+IRR({row('Equity cash flow')},0.01))^12-1",P),
 ('LP IRR',f"=(1+IRR({row('LP cash flow')},0.01))^12-1",P),('GP IRR',f"=(1+IRR({row('GP cash flow')},0.01))^12-1",P),('LP equity multiple',f"=SUMIF({row('LP cash flow')},\">0\")/-SUMIF({row('LP cash flow')},\"<0\")",X),
 ('Net profit',f"=SUM({row('Equity cash flow')})",N),('Total development cost',f"=SUM({row('Total cost')})",N),('Profit on cost',"=B8/B9",P),('Peak debt',f"=MAX({row('Loan balance')})",N),
 ('GP promote ($)',f"=SUM({row('GP cash flow')})-(1-Assumptions!$B$16)*B8",N)])
wb.save(OUT+'jv_usd.xlsx')

# ---------- Saudi phased mixed use with a scenario table ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='AL WAHA MIXED-USE – PHASED DEVELOPMENT (SAR)'
I=inputs(ws,[('sel','Active scenario (1 Base, 2 Downside, 3 Upside)',1,'0'),('land','Land (SAR)',240000000,N),('rett','Real estate transaction tax',0.05,P),('gfa1','Residential GFA (sqm)',60000,N),
 ('gfa2','Office GLA (sqm)',35000,N),('gfa3','Retail GLA (sqm)',18000,N),('p1','Phase 1 residential start (year)',1,'0'),('p2','Phase 2 office start (year)',2,'0'),('p3','Phase 3 retail start (year)',3,'0'),
 ('ltc','Murabaha (% of cost)',0.55,P),('mr','Murabaha profit rate',0.065,P),('zakat','Zakat',0.025,P),('dr','Discount rate',0.1,P)])
sc=wb.create_sheet('Scenarios');sc.append(['Assumption','Base','Downside','Upside','Live'])
srows=[('Residential sale price (SAR/sqm)',9500,8400,10200),('Office rent (SAR/sqm/yr)',1100,950,1200),('Retail rent (SAR/sqm/yr)',1600,1350,1750),('Exit yield',0.075,0.085,0.07),('Construction cost (SAR/sqm)',4200,4600,4100)]
S={}
for i,(l,b,d,u) in enumerate(srows,start=2):
    sc.cell(i,1,l);fm=P if l=='Exit yield' else N
    for j,v in enumerate([b,d,u],start=2):c=sc.cell(i,j,v);c.number_format=fm
    c=sc.cell(i,5,f"=CHOOSE({I['sel']},B{i},C{i},D{i})");c.number_format=fm;S[l]=f"Scenarios!$E${i}"
cf=wb.create_sheet('Cash Flow');Y=12
lab=['Year','Land and RETT','Residential build','Office build','Retail build','Total cost','Residential sales','Office NOI','Retail NOI','Exit value','Revenue','Murabaha drawn','Murabaha profit','Murabaha repaid','Murabaha balance','Pre-zakat cash flow','Zakat','Unlevered cash flow','Equity cash flow']
R={l:i+3 for i,l in enumerate(lab)}
for l,r in R.items():cf.cell(r,1,l)
cost=S['Construction cost (SAR/sqm)']
for y in range(Y+1):
    c=L(y+2);p=L(y+1);first=y==0
    def g(n,e):cf[f'{c}{R[n]}']='='+e
    cf[f'{c}3']=y
    g('Land and RETT',f"IF({c}$3=0,{I['land']}*(1+{I['rett']}),0)")
    g('Residential build',f"IF(AND({c}$3>={I['p1']},{c}$3<{I['p1']}+2),{I['gfa1']}*{cost}/2,0)")
    g('Office build',f"IF(AND({c}$3>={I['p2']},{c}$3<{I['p2']}+2),{I['gfa2']}*{cost}/2,0)")
    g('Retail build',f"IF(AND({c}$3>={I['p3']},{c}$3<{I['p3']}+2),{I['gfa3']}*{cost}/2,0)")
    g('Total cost',f"SUM({c}4:{c}7)")
    g('Residential sales',f"IF(AND({c}$3>={I['p1']}+2,{c}$3<{I['p1']}+5),{I['gfa1']}*{S['Residential sale price (SAR/sqm)']}/3,0)")
    g('Office NOI',f"IF(AND({c}$3>={I['p2']}+2,{c}$3<{Y}),{I['gfa2']}*{S['Office rent (SAR/sqm/yr)']}*0.9,0)")
    g('Retail NOI',f"IF(AND({c}$3>={I['p3']}+2,{c}$3<{Y}),{I['gfa3']}*{S['Retail rent (SAR/sqm/yr)']}*0.88,0)")
    g('Exit value',f"IF({c}$3={Y},({I['gfa2']}*{S['Office rent (SAR/sqm/yr)']}*0.9+{I['gfa3']}*{S['Retail rent (SAR/sqm/yr)']}*0.88)/{S['Exit yield']},0)")
    g('Revenue',f"SUM({c}9:{c}12)")
    pb='0' if first else f"{p}{R['Murabaha balance']}"
    g('Murabaha drawn',f"{c}{R['Total cost']}*{I['ltc']}")
    g('Murabaha profit',f"{pb}*{I['mr']}")
    g('Murabaha repaid',f"MIN({c}{R['Revenue']},{pb}+{c}{R['Murabaha drawn']}+{c}{R['Murabaha profit']})")
    g('Murabaha balance',f"{pb}+{c}{R['Murabaha drawn']}+{c}{R['Murabaha profit']}-{c}{R['Murabaha repaid']}")
    g('Pre-zakat cash flow',f"{c}{R['Revenue']}-{c}{R['Total cost']}")
    g('Zakat',f"-MAX(0,{c}{R['Pre-zakat cash flow']}-{c}{R['Murabaha profit']})*{I['zakat']}")
    g('Unlevered cash flow',f"{c}{R['Pre-zakat cash flow']}+{c}{R['Zakat']}")
    g('Equity cash flow',f"{c}{R['Unlevered cash flow']}+{c}{R['Murabaha drawn']}-{c}{R['Murabaha repaid']}")
E=L(Y+2);row=lambda n:f"'Cash Flow'!B{R[n]}:{E}{R[n]}";rowc=lambda n:f"'Cash Flow'!C{R[n]}:{E}{R[n]}"
rs=wb.create_sheet('Returns');table(rs,[('Project IRR',f"=IRR({row('Unlevered cash flow')})",P),('Equity IRR',f"=IRR({row('Equity cash flow')})",P),
 ('NPV at the discount rate',f"=NPV({I['dr']},{rowc('Unlevered cash flow')})+'Cash Flow'!B{R['Unlevered cash flow']}",N),('Profit after zakat',f"=SUM({row('Unlevered cash flow')})",N),
 ('Peak murabaha',f"=MAX({row('Murabaha balance')})",N),('Total development cost',f"=SUM({row('Total cost')})",N)])
wb.save(OUT+'mixed_sar.xlsx')

# ---------- Iberian hotel portfolio: three sheets with the same labels ----------
wb=openpyxl.Workbook();first=wb.active;first.title='Portfolio';first['A1']='IBERIA HOTEL PORTFOLIO (EUR)'
H={}
for nm,keys,adr,occ,gop,price in [('Lisbon',180,185,0.78,0.36,62000000),('Porto',140,150,0.74,0.34,41000000),('Madrid',220,170,0.8,0.38,88000000)]:
    s=wb.create_sheet(nm);s['A1']=f'{nm.upper()} HOTEL'
    H[nm]=inputs(s,[('keys','Keys',keys,N),('adr','ADR (€)',adr,N),('occ','Occupancy',occ,P),('g','ADR growth',0.03,P),('fb','F&B and other (% of rooms)',0.35,P),('gop','GOP margin',gop,P),('ffe','FF&E reserve',0.04,P),('price','Purchase price (€)',price,N)])
    table(s,[('Rooms revenue (year 1)',f"={H[nm]['keys']}*365*{H[nm]['adr']}*{H[nm]['occ']}",N),('Total revenue (year 1)',f"=B13*(1+{H[nm]['fb']})",N),('EBITDA after FF&E (year 1)',f"=B14*({H[nm]['gop']}-{H[nm]['ffe']})",N)],start=13)
I=inputs(first,[('ltv','Loan to value',0.55,P),('rate','Interest rate',0.048,P),('exit','Exit cap rate',0.07,P),('hold','Hold (years)',5,'0'),('costs','Acquisition costs',0.045,P)])
cf=wb.create_sheet('Consolidated');cf['A3']='Year';cf['A4']='EBITDA';cf['A5']='Purchase';cf['A6']='Sale';cf['A7']='Unlevered cash flow';cf['A8']='Debt';cf['A9']='Interest';cf['A10']='Equity cash flow'
price="(Lisbon!$B$10+Porto!$B$10+Madrid!$B$10)"
for y in range(0,8):
    c=L(y+2);cf[f'{c}3']=y;on=f"({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}4']=f"={on}*(Lisbon!$B$15*(1+Lisbon!$B$6)^({c}$3-1)+Porto!$B$15*(1+Porto!$B$6)^({c}$3-1)+Madrid!$B$15*(1+Madrid!$B$6)^({c}$3-1))"
    cf[f'{c}5']=f"=IF({c}$3=0,-{price}*(1+{I['costs']}),0)"
    cf[f'{c}6']=f"=IF({c}$3={I['hold']},(Lisbon!$B$15*(1+Lisbon!$B$6)^{c}$3+Porto!$B$15*(1+Porto!$B$6)^{c}$3+Madrid!$B$15*(1+Madrid!$B$6)^{c}$3)/{I['exit']},0)"
    cf[f'{c}7']=f"=SUM({c}4:{c}6)"
    cf[f'{c}8']=f"=IF({c}$3=0,{price}*{I['ltv']},0)-IF({c}$3={I['hold']},{price}*{I['ltv']},0)"
    cf[f'{c}9']=f"=-{on}*{price}*{I['ltv']}*{I['rate']}"
    cf[f'{c}10']=f"={c}7+{c}8+{c}9"
rs=wb.create_sheet('Returns');table(rs,[('Unlevered IRR',"=IRR(Consolidated!B7:I7)",P),('Levered IRR',"=IRR(Consolidated!B10:I10)",P),('Equity multiple',"=SUMIF(Consolidated!B10:I10,\">0\")/-SUMIF(Consolidated!B10:I10,\"<0\")",X),
 ('Net profit',"=SUM(Consolidated!B10:I10)",N),('Year 1 debt yield',f"=Consolidated!C4/({price}*{I['ltv']})",P),('Year 1 interest cover',"=-Consolidated!C4/Consolidated!C9",X)])
wb.save(OUT+'hotels_eur.xlsx')

# ---------- UK long income with a sculpted loan ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='CHELTENHAM CARE PORTFOLIO – LONG INCOME, SCULPTED DEBT (GBP)'
I=inputs(ws,[('price','Purchase price (£)',78000000,N),('costs','Purchase costs',0.068,P),('rent','Initial rent (£)',4200000,N),('cpi','CPI forecast',0.025,P),('floor','Indexation floor',0.01,P),('cap','Indexation cap',0.04,P),
 ('opex','Non-recoverable costs (£ a year)',150000,N),('dscr','Target DSCR',1.25,X),('tenor','Loan tenor (years)',20,'0'),('rate','Loan interest rate',0.055,P),('exit','Exit yield',0.055,P),('hold','Hold (years)',25,'0')])
cf=wb.create_sheet('Cash Flow');lab=['Year','Indexation','Rent','CFADS','Debt service','Sale','Purchase','Equity cash flow','Unlevered cash flow']
R={l:i+3 for i,l in enumerate(lab)}
for l,r in R.items():cf.cell(r,1,l)
Y=25
for y in range(Y+1):
    c=L(y+2);p=L(y+1);cf[f'{c}3']=y
    cf[f'{c}4']='=0' if y==0 else f"=MIN({I['cap']},MAX({I['floor']},{I['cpi']}))"
    cf[f'{c}5']='=0' if y==0 else (f"={I['rent']}" if y==1 else f"={p}5*(1+{c}4)")
    cf[f'{c}6']=f"=IF(AND({c}$3>=1,{c}$3<={I['hold']}),{c}5-{I['opex']},0)"
    cf[f'{c}7']=f"=IF(AND({c}$3>=1,{c}$3<={I['tenor']}),{c}6/{I['dscr']},0)"
    cf[f'{c}8']=f"=IF({c}$3={I['hold']},{c}5*(1+{c}4)/{I['exit']},0)"
    cf[f'{c}9']=f"=IF({c}$3=0,-{I['price']}*(1+{I['costs']}),0)"
    cf[f'{c}11']=f"={c}6+{c}8+{c}9"
E=L(Y+2)
rs=wb.create_sheet('Debt');table(rs,[('Debt size (£)',f"=NPV({I['rate']},'Cash Flow'!C7:{E}7)",N),('Gearing (loan to price)',f"=B3/{I['price']}",P),('LLCR',f"=NPV({I['rate']},'Cash Flow'!C6:{L(21+1)}6)/B3",X),
 ('Minimum DSCR',f"=MIN('Cash Flow'!C6:{L(21+1)}6)/MAX('Cash Flow'!C7:{L(21+1)}7)*0+{I['dscr']}",X),('Equity in (£)',f"={I['price']}*(1+{I['costs']})-B3",N)])
for y in range(Y+1):
    c=L(y+2);cf[f'{c}10']=f"=IF({c}$3=0,Debt!$B$3,0)-{c}7+{c}11"
cf['A10']='Equity cash flow';cf['A11']='Unlevered cash flow'
rt=wb.create_sheet('Returns');table(rt,[('Unlevered IRR',f"=IRR('Cash Flow'!B11:{E}11)",P),('Equity IRR',f"=IRR('Cash Flow'!B10:{E}10)",P),('Net initial yield',f"=('Cash Flow'!C5-{I['opex']})/({I['price']}*(1+{I['costs']}))",P),('Net profit',f"=SUM('Cash Flow'!B10:{E}10)",N)])
wb.save(OUT+'sculpt_gbp.xlsx')

# ---------- Warsaw logistics: EUR rent, PLN costs ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='WARSAW SOUTH LOGISTICS PARK – DEVELOPMENT (results in EUR)'
ws['D3']='Reporting currency';ws['E3']='EUR'
I=inputs(ws,[('gla','GLA (sqm)',85000,N),("rent","Rent (EUR/sqm/month)",5.4,N2),('free','Rent-free (months)',6,'0'),('land','Land (PLN)',48000000,N),("build","Construction cost (PLN/sqm)",2600,N),('prof','Professional fees (% of build)',0.08,P),
 ('fx','EUR/PLN exchange rate',4.32,'0.0000'),('exitY','Exit yield',0.0625,P),('lease','Lease-up (months)',9,'0'),('fin','Finance cost (% of cost)',0.045,P)])
table(wb.create_sheet('Appraisal'),[('Rent (EUR a year)',f"={I['gla']}*{I['rent']}*12",N),('Gross development value (EUR)',f"=B3/{I['exitY']}",N),('Land (EUR)',f"={I['land']}/{I['fx']}",N),
 ('Construction (EUR)',f"={I['gla']}*{I['build']}/{I['fx']}",N),('Fees (EUR)',f"=B6*{I['prof']}",N),('Rent-free and lease-up (EUR)',f"=B3/12*({I['free']}+{I['lease']})",N),('Finance (EUR)',f"=(B5+B6+B7)*{I['fin']}",N),
 ('Total development cost (EUR)',"=SUM(B5:B9)",N),('Net profit (EUR)',"=B4-B10",N),('Profit on cost',"=B11/B10",P),('Yield on cost',"=B3/B10",P),('Total cost in PLN',f"=B10*{I['fx']}",N)])
wb.save(OUT+'fx_pln.xlsx')

# ---------- UK retail park, live case through INDIRECT ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='WESTGATE RETAIL PARK (GBP)'
I=inputs(ws,[('case','Case (Base, Low or High)','Base','@'),('area','Lettable area (sq ft)',210000,N),('price','Purchase price (£)',46000000,N),('costs','Purchase costs',0.068,P),('hold','Hold (years)',5,'0')])
cs=wb.create_sheet('Cases');cs.append(['Assumption','Base','Low','High'])
for i,(l,b,lo,hi,fm) in enumerate([('Rent (£/sq ft)',18.5,16.0,20.0,N2),('Rental growth',0.02,0.0,0.03,P),('Exit yield',0.075,0.085,0.07,P),('Vacancy',0.06,0.12,0.04,P)],start=2):
    cs.cell(i,1,l)
    for j,v in enumerate([b,lo,hi],start=2):c=cs.cell(i,j,v);c.number_format=fm
for nm,col in [('Base','B'),('Low','C'),('High','D')]:wb.defined_names[nm]=DefinedName(nm,attr_text=f"Cases!${col}$2:${col}$5")
lv=wb.create_sheet('Live');lv['A1']='Live case'
for i,l in enumerate(['Rent (£/sq ft)','Rental growth','Exit yield','Vacancy'],start=3):
    lv.cell(i,1,l);c=lv.cell(i,2,f"=INDEX(INDIRECT({I['case']}),{i-2})");c.number_format=P if i>3 else N2
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';cf['A4']='Net rent';cf['A5']='Sale';cf['A6']='Purchase';cf['A7']='Cash flow'
for y in range(0,7):
    c=L(y+2);cf[f'{c}3']=y;on=f"({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}4']=f"={on}*{I['area']}*Live!$B$3*(1-Live!$B$6)*(1+Live!$B$4)^MAX(0,{c}$3-1)"
    cf[f'{c}5']=f"=IF({c}$3={I['hold']},{I['area']}*Live!$B$3*(1-Live!$B$6)*(1+Live!$B$4)^{c}$3/Live!$B$5,0)"
    cf[f'{c}6']=f"=IF({c}$3=0,-{I['price']}*(1+{I['costs']}),0)";cf[f'{c}7']=f"=SUM({c}4:{c}6)"
table(wb.create_sheet('Returns'),[('Unlevered IRR',"=IRR('Cash Flow'!B7:H7)",P),('Net profit',"=SUM('Cash Flow'!B7:H7)",N),('Net initial yield',f"='Cash Flow'!C4/({I['price']}*(1+{I['costs']}))",P)])
wb.save(OUT+'indir_gbp.xlsx')
print('ok')

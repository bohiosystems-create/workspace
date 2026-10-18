# round 28: funds again, of other kinds, and the earlier models on the desk to check the earlier fixes hold
#  debt     - USD real estate debt fund, figures in USD m: a book of eight loans (rate, LTV, maturity), a default with a recovery,
#             fund leverage, net interest income, a management fee and an incentive fee over a hurdle, net IRR to LPs
#  eltif    - EUR semi-liquid fund (ELTIF-style), monthly: three share classes with their own fees, a liquidity sleeve, redemptions
#             capped at 5% of NAV a quarter, swing pricing on net outflows
#  fof      - USD fund of funds: commitments to five funds, each with its call and distribution curve (J-curve), the fund of funds' own
#             fees on top; gross and net TVPI and IRR
#  cma      - SAR private real estate fund (CMA-style): units at SAR 10, two development projects, fund board, custodian and
#             management fees, zakat, the unit value year by year
import openpyxl,os
from openpyxl.utils import get_column_letter as L
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m28/'
os.makedirs(OUT,exist_ok=True)
P='0.00%';N='#,##0';X='0.00"x"';M1='#,##0.0'
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

# ================= 28A real estate debt fund (USD m) =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='HARBOUR LENDING FUND II – REAL ESTATE DEBT (USD m)'
I=inputs(ws,[('equity','LP equity (USD m)',450,M1),('lev','Fund leverage (debt to equity)',0.5,X),('cof','Cost of fund leverage',0.058,P),('mgmt','Management fee on equity',0.0075,P),
 ('hurdle','Incentive fee hurdle (net return a year)',0.06,P),('inc','Incentive fee above the hurdle',0.15,P),('def','Defaulted loan recovery',0.8,P),('opex','Fund expenses a year (USD m)',2.2,M1)])
lb=wb.create_sheet('Loans');lb.append(['Loan','Amount (USD m)','Coupon','LTV','Maturity (year)','Defaults in year'])
for row_ in [('Chicago office',120,0.085,0.62,3,0),('Austin multifamily',95,0.078,0.68,4,0),('Miami hotel',80,0.098,0.6,3,2),('Denver industrial',110,0.072,0.55,5,0),
             ('Phoenix BTR',70,0.081,0.7,4,0),('Seattle life science',90,0.093,0.58,5,0),('Atlanta retail',60,0.105,0.64,2,0),('Dallas student',75,0.079,0.66,4,0)]:lb.append(list(row_))
for r in range(2,10):lb.cell(r,3).number_format=P;lb.cell(r,4).number_format=P
cf=wb.create_sheet('Fund');T=5
labs=['Year','Loans outstanding','Interest income','Default loss','Principal back','Leverage cost','Management fee','Expenses','Net income before incentive','Incentive fee','Net to LPs']
def dfund(t,c,p,R):
    y=f"{c}$3";first=t==0
    d={'Year':t,'Loans outstanding':f"SUMPRODUCT(('Loans'!$E$2:$E$9>{y})*(('Loans'!$F$2:$F$9=0)+('Loans'!$F$2:$F$9>{y})>0)*'Loans'!$B$2:$B$9)"}
    d['Interest income']='0' if first else f"SUMPRODUCT(('Loans'!$E$2:$E$9>={y})*(('Loans'!$F$2:$F$9=0)+('Loans'!$F$2:$F$9>{y})>0)*'Loans'!$B$2:$B$9*'Loans'!$C$2:$C$9)"
    d['Default loss']='0' if first else f"SUMPRODUCT(('Loans'!$F$2:$F$9={y})*'Loans'!$B$2:$B$9)*(1-{I['def']})"
    d['Principal back']='0' if first else f"SUMPRODUCT(('Loans'!$E$2:$E$9={y})*('Loans'!$F$2:$F$9=0)*'Loans'!$B$2:$B$9)+SUMPRODUCT(('Loans'!$F$2:$F$9={y})*'Loans'!$B$2:$B$9)*{I['def']}"
    d['Leverage cost']='0' if first else f"MIN({I['equity']}*{I['lev']},{p}{R['Loans outstanding']}*{I['lev']}/(1+{I['lev']}))*{I['cof']}"
    d['Management fee']='0' if first else f"{I['equity']}*{I['mgmt']}"
    d['Expenses']='0' if first else f"{I['opex']}"
    d['Net income before incentive']=f"{c}{R['Interest income']}-{c}{R['Default loss']}-{c}{R['Leverage cost']}-{c}{R['Management fee']}-{c}{R['Expenses']}"
    d['Incentive fee']='0' if first else f"MAX(0,{c}{R['Net income before incentive']}-{I['equity']}*{I['hurdle']})*{I['inc']}"
    sh=f"{I['equity']}/SUM(Loans!$B$2:$B$9)"   # the LPs' share of each repayment (the rest repays the fund's leverage)
    d['Net to LPs']=f"-{I['equity']}" if first else f"{c}{R['Net income before incentive']}-{c}{R['Incentive fee']}+{c}{R['Principal back']}*{sh}"
    return d
R=timeline(cf,labs,T,dfund);E=L(T+2);row=lambda n:f"Fund!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Net IRR to LPs',f"=IRR({row('Net to LPs')})",P),('Weighted average coupon',"=SUMPRODUCT(Loans!B2:B9,Loans!C2:C9)/SUM(Loans!B2:B9)",P),
 ('Weighted average LTV',"=SUMPRODUCT(Loans!B2:B9,Loans!D2:D9)/SUM(Loans!B2:B9)",P),('Credit losses (USD m)',f"=SUM({row('Default loss')})",M1),('Incentive fees (USD m)',f"=SUM({row('Incentive fee')})",M1),
 ('Net income to LPs (USD m)',f"=SUM({row('Net to LPs')})",M1)])
wb.save(OUT+'debt_usd.xlsx')

# ================= 28B semi-liquid fund with three share classes =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='EUROPA INFRA & REAL ASSETS ELTIF – SEMI-LIQUID, MONTHLY (EUR)'
I=inputs(ws,[('nav0','Opening NAV (EUR)',800000000,N),('ret','Asset return a month',0.0055,P),('sleeve','Liquidity sleeve (share of NAV)',0.15,P),('sleevey','Sleeve yield a year',0.03,P),
 ('subs','Subscriptions a month (EUR)',9000000,N),('reds','Redemption requests a month (EUR)',14000000,N),('cap','Redemption cap (share of NAV a quarter)',0.05,P),('swing','Swing factor on net outflows',0.004,P)])
sc=wb.create_sheet('Classes');sc.append(['Class','Share of NAV','Management fee','Distribution fee'])
for row_ in [('A (retail)',0.45,0.017,0.006),('B (private banks)',0.35,0.012,0.003),('I (institutional)',0.2,0.008,0)]:sc.append(list(row_))
for r in range(2,5):[setattr(sc.cell(r,c),'number_format',P) for c in (2,3,4)]
cf=wb.create_sheet('NAV');T=24
labs=['Month','Gross return','Blended fees','Requests','Redemptions paid','Unmet requests','Swing adjustment','NAV','Sleeve','Class A NAV per unit','Class I NAV per unit']
def ef(t,c,p,R):
    m=f"{c}$3";first=t==0
    if first:return{'Month':0,'Gross return':'0','Blended fees':'0','Requests':'0','Redemptions paid':'0','Unmet requests':'0','Swing adjustment':'0','NAV':f"{I['nav0']}",'Sleeve':f"{I['nav0']}*{I['sleeve']}",'Class A NAV per unit':'10','Class I NAV per unit':'10'}
    d={'Month':t}
    d['Gross return']=f"{p}{R['NAV']}*((1-{I['sleeve']})*{I['ret']}+{I['sleeve']}*{I['sleevey']}/12)"
    d['Blended fees']=f"{p}{R['NAV']}*SUMPRODUCT(Classes!$B$2:$B$4,Classes!$C$2:$C$4+Classes!$D$2:$D$4)/12"
    d['Requests']=f"{I['reds']}+{p}{R['Unmet requests']}"
    d['Redemptions paid']=f"IF(MOD({m},3)=0,MIN({c}{R['Requests']},{p}{R['NAV']}*{I['cap']}),0)"
    d['Unmet requests']=f"{c}{R['Requests']}-{c}{R['Redemptions paid']}"
    d['Swing adjustment']=f"IF({c}{R['Redemptions paid']}>{I['subs']},({c}{R['Redemptions paid']}-{I['subs']})*{I['swing']},0)"
    d['NAV']=f"{p}{R['NAV']}+{c}{R['Gross return']}-{c}{R['Blended fees']}+{I['subs']}-{c}{R['Redemptions paid']}+{c}{R['Swing adjustment']}"
    d['Sleeve']=f"{c}{R['NAV']}*{I['sleeve']}"
    d['Class A NAV per unit']=f"{p}{R['Class A NAV per unit']}*(1+{c}{R['Gross return']}/{p}{R['NAV']}-(Classes!$C$2+Classes!$D$2)/12)"
    d['Class I NAV per unit']=f"{p}{R['Class I NAV per unit']}*(1+{c}{R['Gross return']}/{p}{R['NAV']}-(Classes!$C$4+Classes!$D$4)/12)"
    return d
R=timeline(cf,labs,T,ef);E=L(T+2);row=lambda n:f"NAV!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Class A return a year',f"=(NAV!{E}{R['Class A NAV per unit']}/10)^(12/{T})-1",P),('Class I return a year',f"=(NAV!{E}{R['Class I NAV per unit']}/10)^(12/{T})-1",P),
 ('Fee drag, class A over class I a year',"=B4-B3",P),('NAV at month 24 (EUR)',f"=NAV!{E}{R['NAV']}",N),('Unmet redemption requests at the end (EUR)',f"=NAV!{E}{R['Unmet requests']}",N),
 ('Swing income kept by the fund (EUR)',f"=SUM({row('Swing adjustment')})",N),('Liquidity sleeve at the end (EUR)',f"=NAV!{E}{R['Sleeve']}",N)])
wb.save(OUT+'eltif_eur.xlsx')

# ================= 28C fund of funds: five funds, J-curves, double fees =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='SUMMIT GLOBAL REAL ESTATE FUND OF FUNDS (USD)'
I=inputs(ws,[('fee','Fund of funds management fee on commitments',0.0075,P),('carry','Fund of funds carry over 8%',0.05,P),('pref','Fund of funds hurdle',0.08,P),('over','Overcommitment',1.2,X),('size','Fund of funds size (USD)',500000000,N)])
uf=wb.create_sheet('Funds');uf.append(['Fund','Share of commitments','Net multiple','Life (years)'])
for row_ in [('Value-add Europe',0.25,1.65,7),('US industrial',0.2,1.8,6),('Asia opportunistic',0.2,1.9,8),('Core plus US',0.2,1.45,7),('GCC development',0.15,2.0,8)]:uf.append(list(row_))
for r in range(2,7):uf.cell(r,2).number_format=P;uf.cell(r,3).number_format=X
cu=wb.create_sheet('Curves');cu.append(['Year','Called (share of commitment)','Distributed (share of value)'])
for y,cl,ds in [(1,0.25,0),(2,0.3,0.02),(3,0.25,0.06),(4,0.15,0.12),(5,0.05,0.18),(6,0,0.22),(7,0,0.2),(8,0,0.12),(9,0,0.08),(10,0,0)]:cu.append([y,cl,ds])
cf=wb.create_sheet('Cash Flow');T=10
labs=['Year','Calls from funds','Distributions from funds','Fund of funds fee','Net to investors before carry','Carry','Net to investors']
def ff(t,c,p,R):
    y=f"{c}$3";first=t==0;C=f"{I['size']}*{I['over']}"
    d={'Year':t,'Calls from funds':'0' if first else f"{C}*SUMPRODUCT(Funds!$B$2:$B$6)*INDEX(Curves!$B$2:$B$11,{y})",
       'Distributions from funds':'0' if first else f"{C}*SUMPRODUCT(Funds!$B$2:$B$6,Funds!$C$2:$C$6)*INDEX(Curves!$C$2:$C$11,{y})/SUM(Curves!$C$2:$C$11)",
       'Fund of funds fee':'0' if first else f"{I['size']}*{I['fee']}*IF({y}<=5,1,0.6)"}
    d['Net to investors before carry']=f"{c}{R['Distributions from funds']}-{c}{R['Calls from funds']}-{c}{R['Fund of funds fee']}"
    d['Carry']=f"IF({y}={T},MAX(0,SUM($B{R['Net to investors before carry']}:{c}{R['Net to investors before carry']})-SUMIF($B{R['Net to investors before carry']}:{c}{R['Net to investors before carry']},\"<0\")*-((1+{I['pref']})^5-1))*{I['carry']},0)"
    d['Net to investors']=f"{c}{R['Net to investors before carry']}-{c}{R['Carry']}"
    return d
R=timeline(cf,labs,T,ff);E=L(T+2);row=lambda n:f"'Cash Flow'!$B${R[n]}:${E}${R[n]}"
table(wb.create_sheet('Returns'),[('Net IRR to investors',f"=IRR({row('Net to investors')})",P),('Gross IRR from the funds',f"=IRR({row('Distributions from funds')})",P),
 ('Net TVPI',f"=(SUM({row('Distributions from funds')})-SUM({row('Carry')}))/(SUM({row('Calls from funds')})+SUM({row('Fund of funds fee')}))",X),('Peak net outflow (USD)',f"=-MIN('Cash Flow'!B{R['Net to investors']+1}:{E}{R['Net to investors']+1})",N),
 ('Fees and carry paid (USD)',f"=SUM({row('Fund of funds fee')})+SUM({row('Carry')})",N)])
cfw=wb['Cash Flow'];cfw.cell(R['Net to investors']+1,1,'Net to investors, cumulative')
for t in range(T+1):cfw.cell(R['Net to investors']+1,t+2,f"=SUM($B{R['Net to investors']}:{L(t+2)}{R['Net to investors']})")
# the gross IRR must see the calls too
wb['Returns']['B4']=f"=IRR('Cash Flow'!B{R['Net to investors']+2}:{E}{R['Net to investors']+2})"
cfw.cell(R['Net to investors']+2,1,'Gross cash flow from the funds')
for t in range(T+1):cfw.cell(R['Net to investors']+2,t+2,f"={L(t+2)}{R['Distributions from funds']}-{L(t+2)}{R['Calls from funds']}")
wb.save(OUT+'fof_usd.xlsx')

# ================= 28D CMA-style private real estate fund (units at SAR 10) =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Terms';ws['A1']='AL DIRIYAH GATE REAL ESTATE FUND – PRIVATE FUND, CMA (SAR)'
I=inputs(ws,[('units','Units subscribed',45000000,N),('unitp','Subscription price per unit (SAR)',10,'0.00'),('mgmt','Management fee (of NAV)',0.015,P),('board','Fund board fees a year (SAR)',600000,N),
 ('cust','Custodian fee (of NAV)',0.0005,P),('zak','Zakat',0.025,P),('sub','Subscription fee',0.02,P),('exitc','Exit costs',0.02,P)])
pj=wb.create_sheet('Projects');pj.append(['Project','Cost (SAR)','Build years','Sale value (SAR)','Sale year'])
for row_ in [('Villas phase 1',185000000,2,305000000,3),('Retail strip',140000000,2,236000000,4)]:pj.append(list(row_))
cf=wb.create_sheet('Fund');T=4
labs=['Year','Spend','Sales','Fees','Zakat','Net cash','Property at cost','Cash','NAV','NAV per unit']
def cm(t,c,p,R):
    y=f"{c}$3";first=t==0;U=f"{I['units']}*{I['unitp']}"
    d={'Year':t,'Spend':'0' if first else "+".join(f"IF({y}<=Projects!$C${r},Projects!$B${r}/Projects!$C${r},0)" for r in (2,3)),
       'Sales':'0' if first else "+".join(f"IF({y}=Projects!$E${r},Projects!$D${r}*(1-{I['exitc']}),0)" for r in (2,3))}
    d['Fees']='0' if first else f"{p}{R['NAV']}*({I['mgmt']}+{I['cust']})+{I['board']}"
    d['Zakat']='0' if first else f"MAX(0,{p}{R['NAV']})*{I['zak']}"
    d['Net cash']=f"{U}*(1-{I['sub']})" if first else f"{c}{R['Sales']}-{c}{R['Spend']}-{c}{R['Fees']}-{c}{R['Zakat']}"
    d['Property at cost']='0' if first else f"{p}{R['Property at cost']}+{c}{R['Spend']}-"+"-".join(f"IF({y}=Projects!$E${r},Projects!$B${r},0)" for r in (2,3))
    d['Cash']=f"{c}{R['Net cash']}" if first else f"{p}{R['Cash']}+{c}{R['Net cash']}"
    d['NAV']=f"{c}{R['Cash']}+{c}{R['Property at cost']}"
    d['NAV per unit']=f"{c}{R['NAV']}/{I['units']}"
    return d
R=timeline(cf,labs,T,cm);E=L(T+2);row=lambda n:f"Fund!$B${R[n]}:${E}${R[n]}"
rs=wb.create_sheet('Returns')
table(rs,[('NAV per unit at the end (SAR)',f"=Fund!{E}{R['NAV per unit']}",'0.000'),('Return per unit a year',f"=(B3/{I['unitp']})^(1/{T})-1",P),('Fees paid over the life (SAR)',f"=SUM({row('Fees')})",N),
 ('Zakat paid (SAR)',f"=SUM({row('Zakat')})",N),('Cash short at any year end (SAR)',f"=-MIN(0,MIN({row('Cash')}))",N)])
wb.save(OUT+'cma_sar.xlsx')
print('ok')

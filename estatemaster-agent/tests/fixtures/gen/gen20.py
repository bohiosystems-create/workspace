# round 20: extreme financial complexity, built from scratch
#  egypt   - New Cairo compound, EGP, quarterly with dates: four products sold on instalment plans (down payment, quarterly instalments
#            over N quarters via SUMIFS windows, delivery payment at handover), price and cost inflation, land paid in instalments,
#            commissions at contract, XNPV / XIRR at a 25% discount rate, receivables outstanding at the horizon
#  refi    - US multifamily, monthly: floating loan on a SOFR curve, 50% swapped, the rest capped (premium up front, monthly payoff),
#            refinance at month 36 sized by the lowest of LTV, DSCR (PV of an amortising payment) and debt yield, cash-out to equity
#  reit    - listed REIT, five years: six assets at their own cap rates, acquisitions funded by equity issued at a premium to NAV
#            and debt, share count roll-forward, FFO / AFFO, payout, AFFO per share, NAV per share, TSR
#  hotel   - resort hotel, monthly for ten years: seasonality table, ramp-up, PIP with rooms out of order, departmental costs,
#            stepped FF&E reserve, owner's priority before the incentive fee, key money, exit on the next twelve months' NOI
#  senior  - senior living, annual: IL / AL / memory care lease-up, fees vs wage inflation, care hours per resident day, in-house
#            staff capacity with agency above it at a premium, amortising loan, DSCR from stabilisation
import openpyxl,os,math,datetime
from openpyxl.utils import get_column_letter as L
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m20/';os.makedirs(OUT+'calc',exist_ok=True)
P='0.00%';N='#,##0';N2='#,##0.00';X='0.00"x"';D='dd-mmm-yyyy'
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

# ---------- 20A Egypt instalment compound ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='SEVEN HILLS – NEW CAIRO COMPOUND (EGP)'
I=inputs(ws,[('start','First quarter end',datetime.date(2026,3,31),D),('dp','Down payment',0.1,P),('dl','Payment on delivery',0.05,P),('nq','Instalment period (quarters)',28,'0'),
 ('esc','Price escalation a quarter',0.04,P),('cesc','Cost escalation a quarter',0.035,P),('comm','Sales commission',0.03,P),('land','Land price (EGP)',2400000000,N),('landdp','Land down payment',0.2,P),
 ('landn','Land instalments (half-yearly)',8,'0'),('disc','Discount rate',0.25,P),('tax','Corporate tax',0.225,P)])
pr=wb.create_sheet('Products');pr.append(['Product','Units','Size (sqm)','Price at launch (EGP/sqm)','Launch quarter','Sales a quarter (units)','Construction start quarter','Build (quarters)','Build cost (EGP/sqm)'])
prods=[('Villas',180,320,62000,1,9,2,10,21000),('Townhouses',260,230,55000,2,14,3,9,19000),('Apartments',900,140,48000,1,45,2,12,17000),('Retail',60,180,70000,6,4,8,8,20000)]
for i,pp in enumerate(prods,start=2):
    for j,v in enumerate(pp,start=1):c=pr.cell(i,j,v);c.number_format=N if j>1 else 'General'
cf=wb.create_sheet('Cash Flow');T=40
cf['A3']='Quarter';cf['A4']='Date'
for t in range(T+1):c=L(t+2);cf[f'{c}3']=t;cf[f'{c}4']=f"=EOMONTH({I['start']},3*{c}$3)";cf[f'{c}4'].number_format=D
row=5;PR={}
for k,(nm,*_) in enumerate(prods):
    pr_=k+2;g=lambda col:f"Products!${col}${pr_}"
    rows={}
    for lab in ['units sold','cumulative units','sales value','instalments','delivery','collections','build cost']:rows[lab]=row;cf.cell(row,1,f'{nm} · {lab}');row+=1
    PR[nm]=rows
    for t in range(T+1):
        c=L(t+2);p=L(t+1);first=t==0;q=f"{c}$3"
        cf[f"{c}{rows['units sold']}"]=f"=IF({q}>={g('E')},MIN({g('F')},{g('B')}-{'0' if first else p+str(rows['cumulative units'])}),0)"
        cf[f"{c}{rows['cumulative units']}"]=f"={c}{rows['units sold']}" if first else f"={p}{rows['cumulative units']}+{c}{rows['units sold']}"
        cf[f"{c}{rows['sales value']}"]=f"={c}{rows['units sold']}*{g('C')}*{g('D')}*(1+{I['esc']})^MAX(0,{q}-{g('E')})"
        rng=f"$B${rows['sales value']}:${L(T+2)}${rows['sales value']}";qr=f"$B$3:${L(T+2)}$3";H=f"({g('G')}+{g('H')})"
        cf[f"{c}{rows['instalments']}"]=f"=(1-{I['dp']}-{I['dl']})/{I['nq']}*SUMIFS({rng},{qr},\">=\"&({q}-{I['nq']}),{qr},\"<=\"&({q}-1))"
        cf[f"{c}{rows['delivery']}"]=f"={I['dl']}*(IF({q}={H},SUMIFS({rng},{qr},\"<=\"&{H}),0)+IF({q}>{H},{c}{rows['sales value']},0))"
        cf[f"{c}{rows['collections']}"]=f"={I['dp']}*{c}{rows['sales value']}+{c}{rows['instalments']}+{c}{rows['delivery']}"
        cf[f"{c}{rows['build cost']}"]=f"=IF(AND({q}>={g('G')},{q}<{H}),{g('B')}*{g('C')}*{g('I')}*(1+{I['cesc']})^{q}/{g('H')},0)"
tot={}
for lab in ['Collections','Sales value','Build cost','Commissions','Land','Pre-tax cash flow','Cumulative cash','Tax','Net cash flow']:tot[lab]=row;cf.cell(row,1,lab);row+=1
for t in range(T+1):
    c=L(t+2);p=L(t+1);q=f"{c}$3"
    cf[f"{c}{tot['Collections']}"]='='+'+'.join(f"{c}{PR[n]['collections']}" for n in PR)
    cf[f"{c}{tot['Sales value']}"]='='+'+'.join(f"{c}{PR[n]['sales value']}" for n in PR)
    cf[f"{c}{tot['Build cost']}"]='='+'+'.join(f"{c}{PR[n]['build cost']}" for n in PR)
    cf[f"{c}{tot['Commissions']}"]=f"={c}{tot['Sales value']}*{I['comm']}"
    cf[f"{c}{tot['Land']}"]=f"=IF({q}=0,{I['land']}*{I['landdp']},IF(AND(MOD({q},2)=0,{q}<=2*{I['landn']}),{I['land']}*(1-{I['landdp']})/{I['landn']},0))"
    cf[f"{c}{tot['Pre-tax cash flow']}"]=f"={c}{tot['Collections']}-{c}{tot['Build cost']}-{c}{tot['Commissions']}-{c}{tot['Land']}"
    cf[f"{c}{tot['Cumulative cash']}"]=f"={c}{tot['Pre-tax cash flow']}" if t==0 else f"={p}{tot['Cumulative cash']}+{c}{tot['Pre-tax cash flow']}"
    # tax on cumulative profit once the cumulative cash is positive (losses carried), paid quarterly on the increase
    cf[f"{c}{tot['Tax']}"]=f"=MAX(0,{c}{tot['Cumulative cash']})*{I['tax']}" if t==0 else f"=MAX(0,{c}{tot['Cumulative cash']})*{I['tax']}-MAX(0,{p}{tot['Cumulative cash']})*{I['tax']}"
    cf[f"{c}{tot['Net cash flow']}"]=f"={c}{tot['Pre-tax cash flow']}-{c}{tot['Tax']}"
E=L(T+2);rw=lambda r:f"'Cash Flow'!B{r}:{E}{r}";dts=f"'Cash Flow'!B4:{E}4"
table(wb.create_sheet('Returns'),[('Project IRR (XIRR)',f"=XIRR({rw(tot['Net cash flow'])},{dts})",P),('NPV at the discount rate (EGP)',f"=XNPV({I['disc']},{rw(tot['Net cash flow'])},{dts})",N),
 ('Net profit (EGP)',f"=SUM({rw(tot['Net cash flow'])})",N),('Peak funding (EGP)',f"=-MIN({rw(tot['Cumulative cash'])})",N),('Total sales value (EGP)',f"=SUM({rw(tot['Sales value'])})",N),
 ('Receivables outstanding at the horizon (EGP)',"=B7-SUM("+rw(tot['Collections'])+")",N),('Total development cost (EGP)',f"=SUM({rw(tot['Build cost'])})+SUM({rw(tot['Land'])})+SUM({rw(tot['Commissions'])})",N)])
wb.save(OUT+'egypt_egp.xlsx')

# ---------- 20B floating loan with swap and cap, refinance by the lowest of three tests ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='HARBOUR VIEW APARTMENTS – FLOATING DEBT, HEDGES AND REFINANCE (USD)'
I=inputs(ws,[('price','Purchase price ($)',120000000,N),('costs','Closing costs',0.015,P),('noi','NOI year 1 ($)',6600000,N),('g','NOI growth a year',0.035,P),('ltc','Bridge loan to cost',0.65,P),('marg','Bridge margin over SOFR',0.0275,P),
 ('swapn','Swapped share of the loan',0.5,P),('swapr','Swap fixed rate',0.036,P),('strike','Cap strike',0.045,P),('prem','Cap premium (% of capped notional)',0.012,P),('refm','Refinance month',36,'0'),
 ('rltv','Refinance max LTV',0.6,P),('rdscr','Refinance min DSCR',1.25,X),('rdy','Refinance min debt yield',0.085,P),('rrate','Refinance rate',0.056,P),('ramyrs','Refinance amortisation (years)',30,'0'),
 ('rcap','Valuation cap rate at refinance',0.0525,P),('exitm','Exit month',60,'0'),('exit','Exit cap rate',0.055,P),('sell','Selling costs',0.015,P)])
cvs=wb.create_sheet('SOFR');cvs['A1']='Month';cvs['B1']='SOFR forward'
for m in range(1,61):cvs.cell(m+1,1,m);c=cvs.cell(m+1,2,round(0.0430-0.0095*(1-math.exp(-m/18))+0.0025*math.sin(m/9),6));c.number_format=P
cf=wb.create_sheet('Cash Flow');T=60
labs=['Month','SOFR','NOI','Bridge balance','Floating interest','Swap net payment','Cap payoff','Cap premium','Bridge interest, net of hedges','Value at refinance','LTV test','DSCR test','Debt yield test',
 'Refinance loan','Refinance payoff of bridge','Cash-out','Perm balance','Perm interest','Perm principal','Debt service','DSCR (trailing month)','Sale','Equity cash flow']
def f20b(t,c,p,R):
    first=t==0;m=f"{c}$3";bridge=f"({m}>=1)*({m}<={I['refm']})";perm=f"({m}>{I['refm']})*({m}<={I['exitm']})";LN=f"{I['price']}*{I['ltc']}"
    noi12=f"{I['noi']}*(1+{I['g']})^(({I['refm']})/12)"
    pay=f"PMT({I['rrate']}/12,{I['ramyrs']}*12,-1)"
    return {'Month':t,'SOFR':'0' if first else f"INDEX(SOFR!$B$2:$B$61,{m})",'NOI':f"IF(AND({m}>=1,{m}<={I['exitm']}),{I['noi']}/12*(1+{I['g']})^(({m}-1)/12),0)",
     'Bridge balance':f"IF({m}<{I['refm']},{LN},0)",'Floating interest':f"{bridge}*{LN}*({c}{R['SOFR']}+{I['marg']})/12",
     'Swap net payment':f"{bridge}*{LN}*{I['swapn']}*({I['swapr']}-{c}{R['SOFR']})/12",'Cap payoff':f"{bridge}*{LN}*(1-{I['swapn']})*MAX(0,{c}{R['SOFR']}-{I['strike']})/12",
     'Cap premium':f"IF({m}=0,{LN}*(1-{I['swapn']})*{I['prem']},0)",'Bridge interest, net of hedges':f"{c}{R['Floating interest']}+{c}{R['Swap net payment']}-{c}{R['Cap payoff']}",
     'Value at refinance':f"IF({m}={I['refm']},{noi12}/{I['rcap']},0)",'LTV test':f"{c}{R['Value at refinance']}*{I['rltv']}",
     'DSCR test':f"IF({m}={I['refm']},{noi12}/{I['rdscr']}/12/{pay},0)",'Debt yield test':f"IF({m}={I['refm']},{noi12}/{I['rdy']},0)",
     'Refinance loan':f"IF({m}={I['refm']},MIN({c}{R['LTV test']},{c}{R['DSCR test']},{c}{R['Debt yield test']}),0)",'Refinance payoff of bridge':f"IF({m}={I['refm']},{LN},0)",
     'Cash-out':f"{c}{R['Refinance loan']}-{c}{R['Refinance payoff of bridge']}",
     'Perm balance':'0' if first else f"IF({m}={I['refm']},{c}{R['Refinance loan']},IF({m}>{I['refm']},{p}{R['Perm balance']}-{c}{R['Perm principal']},0))",
     'Perm interest':'0' if first else f"{perm}*{p}{R['Perm balance']}*{I['rrate']}/12",'Perm principal':'0' if first else f"IF({perm},{p}{R['Perm balance']}*{pay}-{c}{R['Perm interest']},0)",
     'Debt service':f"{c}{R['Bridge interest, net of hedges']}+{c}{R['Perm interest']}+{c}{R['Perm principal']}",'DSCR (trailing month)':f"IF({c}{R['Debt service']}>0,{c}{R['NOI']}/{c}{R['Debt service']},99)",
     'Sale':f"IF({m}={I['exitm']},{I['noi']}*(1+{I['g']})^({m}/12)/{I['exit']}*(1-{I['sell']})-{c}{R['Perm balance']},0)",
     'Equity cash flow':f"-({I['price']}*(1+{I['costs']})-{LN})-{c}{R['Cap premium']}" if first else f"{c}{R['NOI']}-{c}{R['Debt service']}+{c}{R['Cash-out']}+{c}{R['Sale']}"}
R=timeline(cf,labs,T,f20b);E=L(T+2);row=lambda n:f"'Cash Flow'!B{R[n]}:{E}{R[n]}";rowc=lambda n:f"'Cash Flow'!C{R[n]}:{E}{R[n]}"
table(wb.create_sheet('Returns'),[('Levered IRR',f"=(1+IRR({row('Equity cash flow')},0.01))^12-1",P),('Equity multiple',f"=SUMIF({row('Equity cash flow')},\">0\")/-SUMIF({row('Equity cash flow')},\"<0\")",X),
 ('Refinance loan ($)',f"=SUM({row('Refinance loan')})",N),('Cash-out at refinance ($)',f"=SUM({row('Cash-out')})",N),('Refinance sized by',f"=IF(B5=SUM({row('LTV test')}),\"LTV\",IF(B5=SUM({row('DSCR test')}),\"DSCR\",\"Debt yield\"))",'@'),
 ('Hedge result ($)',f"=SUM({row('Cap payoff')})-SUM({row('Swap net payment')})-SUM({row('Cap premium')})",N),('Minimum DSCR',f"=MIN({rowc('DSCR (trailing month)')})",X),('Net profit ($)',f"=SUM({row('Equity cash flow')})",N)])
wb.save(OUT+'refi_usd.xlsx')

# ---------- 20C REIT NAV and issuance ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='MERIDIAN LOGISTICS REIT – NAV, ISSUANCE AND AFFO (SGD)'
I=inputs(ws,[('shares','Units outstanding (m)',2800,N),('debt','Debt (S$ m)',2100,N),('rate','Cost of debt',0.038,P),('ga','G&A (S$ m a year)',28,N),('maint','Maintenance capex (% of NOI)',0.12,P),
 ('payout','Payout (% of AFFO)',0.9,P),('prem','Issue price premium to NAV',0.05,P),('acq','Acquisitions a year (S$ m)',450,N),('acap','Acquisition cap rate',0.0625,P),('eqmix','Acquisitions funded by equity',0.6,P),
 ('ng','Same-property NOI growth',0.025,P),('pcap','Portfolio valuation cap rate shift (bps)',0,'0'),('fee','Acquisition fee',0.01,P)])
asx=wb.create_sheet('Assets');asx.append(['Asset','NOI (S$ m)','Cap rate'])
for i,a in enumerate([('Tuas Megahub',62,0.0575),('Changi Air Cargo',48,0.0525),('Jurong Cold Chain',37,0.06),('Woodlands Flex',29,0.065),('Sydney Moorebank',55,0.0475),('Osaka Bay DC',41,0.0425)],start=2):
    for j,v in enumerate(a,start=1):c=asx.cell(i,j,v);c.number_format=P if j==3 else ('#,##0.0' if j==2 else 'General')
cf=wb.create_sheet('Projection');T=5
labs=['Year','Same-property NOI','Acquired NOI','NOI','Portfolio value','Acquisitions','Equity raised','Debt drawn','Debt','Interest','FFO','AFFO','Units','Issue price','New units','NAV','NAV per unit','AFFO per unit','Distribution per unit','LTV','Unit price']
def f20c(t,c,p,R):
    first=t==0;y=f"{c}$3";V0=f"SUMPRODUCT(Assets!$B$2:$B$7/(Assets!$C$2:$C$7+{I['pcap']}/10000))"
    return {'Year':t,'Same-property NOI':f"SUM(Assets!$B$2:$B$7)*(1+{I['ng']})^{y}",
     'Acquired NOI':'0' if first else f"{p}{R['Acquired NOI']}*(1+{I['ng']})+{p}{R['Acquisitions']}*{I['acap']}",'NOI':f"{c}{R['Same-property NOI']}+{c}{R['Acquired NOI']}",
     'Portfolio value':f"{V0}*(1+{I['ng']})^{y}+{c}{R['Acquired NOI']}/(SUMPRODUCT(Assets!$B$2:$B$7,Assets!$C$2:$C$7)/SUM(Assets!$B$2:$B$7)+{I['pcap']}/10000)",
     'Acquisitions':'0' if t==T else f"{I['acq']}",'Equity raised':f"{c}{R['Acquisitions']}*(1+{I['fee']})*{I['eqmix']}",'Debt drawn':f"{c}{R['Acquisitions']}*(1+{I['fee']})*(1-{I['eqmix']})",
     'Debt':f"{I['debt']}+{c}{R['Debt drawn']}" if first else f"{p}{R['Debt']}+{c}{R['Debt drawn']}",'Interest':'0' if first else f"{p}{R['Debt']}*{I['rate']}",
     'FFO':'0' if first else f"{c}{R['NOI']}-{c}{R['Interest']}-{I['ga']}",'AFFO':'0' if first else f"{c}{R['FFO']}-{c}{R['NOI']}*{I['maint']}",
     'Units':f"{I['shares']}+{c}{R['New units']}" if first else f"{p}{R['Units']}+{c}{R['New units']}",
     'Issue price':f"({V0}-{I['debt']})/{I['shares']}*(1+{I['prem']})" if first else f"{p}{R['NAV per unit']}*(1+{I['prem']})",
     'New units':f"{c}{R['Equity raised']}/{c}{R['Issue price']}",'NAV':f"{c}{R['Portfolio value']}+{c}{R['Acquisitions']}-{c}{R['Debt']}",
     'NAV per unit':f"{c}{R['NAV']}/{c}{R['Units']}",'AFFO per unit':'0' if first else f"{c}{R['AFFO']}/{p}{R['Units']}",'Distribution per unit':f"{c}{R['AFFO per unit']}*{I['payout']}",
     'LTV':f"{c}{R['Debt']}/({c}{R['Portfolio value']}+{c}{R['Acquisitions']})",'Unit price':f"{c}{R['NAV per unit']}*(1+{I['prem']})"}
R=timeline(cf,labs,T,f20c);row=lambda n,a='B',b='G':f"Projection!{a}{R[n]}:{b}{R[n]}"
cf.cell(R['Unit price']+2,1,'Unitholder cash flow')
for t in range(T+1):
    c=L(t+2);cf[f"{c}{R['Unit price']+2}"]=f"=-{c}{R['Unit price']}" if t==0 else (f"={c}{R['Distribution per unit']}+{c}{R['Unit price']}" if t==T else f"={c}{R['Distribution per unit']}")
table(wb.create_sheet('Returns'),[('Total unitholder return (IRR)',f"=IRR(Projection!B{R['Unit price']+2}:G{R['Unit price']+2})",P),('AFFO per unit, year 1 (S$)',f"=Projection!C{R['AFFO per unit']}",'0.0000'),
 ('AFFO per unit CAGR (years 1-5)',f"=(Projection!G{R['AFFO per unit']}/Projection!C{R['AFFO per unit']})^(1/4)-1",P),('NAV per unit, year 5 (S$)',f"=Projection!G{R['NAV per unit']}",'0.0000'),
 ('LTV, year 5',f"=Projection!G{R['LTV']}",P),('Units issued (m)',f"=SUM({row('New units')})",N),('NAV per unit today (S$)',f"=Projection!B{R['NAV per unit']}",'0.0000')])
wb.save(OUT+'reit_sgd.xlsx')

# ---------- 20D resort hotel monthly ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='CAPE AZURE RESORT – MONTHLY OPERATING MODEL (ZAR)'
I=inputs(ws,[('keys','Keys',240,N),('adr','ADR, year 1 average (R)',4200,N),('occ','Stabilised occupancy',0.72,P),('adrg','ADR growth a year',0.055,P),('other','Other revenue (% of rooms)',0.55,P),
 ('rmc','Rooms department cost (% of rooms)',0.24,P),('fbc','Other departments cost (% of other revenue)',0.68,P),('und','Undistributed (% of revenue)',0.19,P),('fix','Fixed costs a month (R)',2600000,N),('fixg','Fixed cost growth a year',0.06,P),
 ('base','Base fee (% of revenue)',0.025,P),('inc','Incentive fee (% above owner priority)',0.15,P),('prio','Owner priority (% of invested capital a year)',0.1,P),('pipm','PIP start month',37,'0'),('pipn','PIP length (months)',6,'0'),
 ('ooo','Rooms out of order during PIP',0.3,P),('pipc','PIP capex (R)',96000000,N),('price','Purchase price (R)',1450000000,N),('key','Key money from operator (R)',40000000,N),('ltv','Loan to value',0.5,P),('rate','Interest rate',0.105,P),('exit','Exit cap rate',0.095,P)])
se=wb.create_sheet('Seasonality');se.append(['Month','Occupancy index','ADR index'])
for m,(o,a) in enumerate([(1.22,1.35),(1.15,1.25),(1.05,1.1),(0.95,0.95),(0.82,0.85),(0.75,0.8),(0.8,0.82),(0.85,0.85),(0.92,0.9),(1.0,0.98),(1.12,1.1),(1.37,1.45)],start=1):
    se.cell(m+1,1,m);se.cell(m+1,2,o);se.cell(m+1,3,a)
cf=wb.create_sheet('Cash Flow');T=120
labs=['Month','Year','Month of year','Ramp-up','PIP','Occupancy','ADR','Room nights','Rooms revenue','Other revenue','Total revenue','Departmental costs','Undistributed','Fixed costs','GOP','Base fee',
 'FF&E reserve','NOI before incentive fee','Owner priority','Incentive fee','NOI','PIP capex','Interest','Sale','Equity cash flow','Unlevered cash flow']
def f20d(t,c,p,R):
    first=t==0;m=f"{c}$3";on=f"({m}>=1)";eq0=f"({I['price']}*(1-{I['ltv']})-{I['key']})"
    return {'Month':t,'Year':f"IF({m}=0,0,INT(({m}-1)/12)+1)",'Month of year':f"IF({m}=0,0,MOD({m}-1,12)+1)",'Ramp-up':f"CHOOSE(MIN(4,MAX(1,{c}{R['Year']}+1)),0,0.86,0.95,1)",
     'PIP':f"IF(AND({m}>={I['pipm']},{m}<{I['pipm']}+{I['pipn']}),1,0)",
     'Occupancy':f"IF({on},MIN(0.98,{I['occ']}*{c}{R['Ramp-up']}*INDEX(Seasonality!$B$2:$B$13,{c}{R['Month of year']})/AVERAGE(Seasonality!$B$2:$B$13))*(1-{I['ooo']}*{c}{R['PIP']}),0)",
     'ADR':f"IF({on},{I['adr']}*(1+{I['adrg']})^({c}{R['Year']}-1)*INDEX(Seasonality!$C$2:$C$13,{c}{R['Month of year']})/AVERAGE(Seasonality!$C$2:$C$13),0)",
     'Room nights':f"{I['keys']}*{c}{R['Occupancy']}*DAY(EOMONTH(DATE(2026,{c}{R['Month of year']}+(({m}=0)*1),1),0))",'Rooms revenue':f"{c}{R['Room nights']}*{c}{R['ADR']}",
     'Other revenue':f"{c}{R['Rooms revenue']}*{I['other']}",'Total revenue':f"{c}{R['Rooms revenue']}+{c}{R['Other revenue']}",
     'Departmental costs':f"{c}{R['Rooms revenue']}*{I['rmc']}+{c}{R['Other revenue']}*{I['fbc']}",'Undistributed':f"{c}{R['Total revenue']}*{I['und']}",
     'Fixed costs':f"IF({on},{I['fix']}*(1+{I['fixg']})^({c}{R['Year']}-1),0)",'GOP':f"{c}{R['Total revenue']}-{c}{R['Departmental costs']}-{c}{R['Undistributed']}-{c}{R['Fixed costs']}",
     'Base fee':f"{c}{R['Total revenue']}*{I['base']}",'FF&E reserve':f"{c}{R['Total revenue']}*IF({c}{R['Year']}<=1,0.02,IF({c}{R['Year']}=2,0.03,0.04))",
     'NOI before incentive fee':f"{c}{R['GOP']}-{c}{R['Base fee']}-{c}{R['FF&E reserve']}",'Owner priority':f"IF({on},({I['price']}+{I['pipc']}-{I['key']})*{I['prio']}/12,0)",
     'Incentive fee':f"MAX(0,{c}{R['NOI before incentive fee']}-{c}{R['Owner priority']})*{I['inc']}",'NOI':f"{c}{R['NOI before incentive fee']}-{c}{R['Incentive fee']}",
     'PIP capex':f"IF({c}{R['PIP']}=1,{I['pipc']}/{I['pipn']},0)",'Interest':f"IF({on},{I['price']}*{I['ltv']}*{I['rate']}/12,0)",
     'Sale':f"IF({m}={T},SUM({L(t-9)}{R['NOI']}:{c}{R['NOI']})/{I['exit']}-{I['price']}*{I['ltv']},0)" if t>=11 else '0',
     'Equity cash flow':f"-{eq0}" if first else f"{c}{R['NOI']}-{c}{R['PIP capex']}-{c}{R['Interest']}+{c}{R['Sale']}",
     'Unlevered cash flow':f"-({I['price']}-{I['key']})" if first else f"{c}{R['NOI']}-{c}{R['PIP capex']}+IF({m}={T},{c}{R['Sale']}+{I['price']}*{I['ltv']},0)"}
R=timeline(cf,labs,T,f20d);E=L(T+2);row=lambda n:f"'Cash Flow'!B{R[n]}:{E}{R[n]}"
table(wb.create_sheet('Returns'),[('Levered IRR',f"=(1+IRR({row('Equity cash flow')},0.01))^12-1",P),('Unlevered IRR',f"=(1+IRR({row('Unlevered cash flow')},0.01))^12-1",P),
 ('Equity multiple',f"=SUMIF({row('Equity cash flow')},\">0\")/-SUMIF({row('Equity cash flow')},\"<0\")",X),('NOI, year 3 (R)',f"=SUMIF('Cash Flow'!B{R['Year']}:{E}{R['Year']},3,'Cash Flow'!B{R['NOI']}:{E}{R['NOI']})",N),
 ('Incentive fees paid (R)',f"=SUM({row('Incentive fee')})",N),('RevPAR, year 1 (R)',f"=SUMIF('Cash Flow'!B{R['Year']}:{E}{R['Year']},1,'Cash Flow'!B{R['Rooms revenue']}:{E}{R['Rooms revenue']})/({I['keys']}*365)",N2),
 ('Net profit (R)',f"=SUM({row('Equity cash flow')})",N)])
wb.save(OUT+'hotel_zar.xlsx')

# ---------- 20E senior living with a labour model ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='MAPLE GROVE SENIOR LIVING – CARE AND LABOUR MODEL (CAD)'
I=inputs(ws,[('cost','Development cost (C$)',165000000,N),('ltc','Loan to cost',0.7,P),('rate','Interest rate',0.0525,P),('am','Amortisation (years)',35,'0'),('absm','Lease-up (move-ins a month, all levels)',9,'0'),
 ('stab','Stabilised occupancy',0.93,P),('feeg','Fee growth a year',0.04,P),('wage','Care wage (C$ an hour)',34,N2),('wageg','Wage growth a year',0.05,P),('fte','In-house care staff (FTE)',70,'0'),('hrs','Hours per FTE a year',1950,N),
 ('agency','Agency premium over wage',0.6,P),('opex','Other opex per occupied unit a month (C$)',1450,N),('mgmt','Management fee (% of revenue)',0.05,P),('res','Capital reserve per unit a year (C$)',750,N),('exit','Exit cap rate',0.0675,P),('hold','Hold (years)',10,'0')])
lv=wb.create_sheet('Levels');lv.append(['Level','Units','Monthly fee (C$)','Care hours per resident day','Share of move-ins'])
for i,l in enumerate([('Independent living',120,4900,0.4,0.45),('Assisted living',80,7600,2.5,0.4),('Memory care',40,10400,4.5,0.15)],start=2):
    for j,v in enumerate(l,start=1):c=lv.cell(i,j,v);c.number_format=N2 if j==4 else (P if j==5 else (N if j>1 else 'General'))
cf=wb.create_sheet('Cash Flow');T=10
labs=['Year','IL occupied','AL occupied','MC occupied','Revenue','Care hours needed','In-house hours','Agency hours','Care labour','Other opex','Management fee','Capital reserve','NOI','Loan balance','Interest','Principal','Debt service','DSCR','Sale','Equity cash flow']
def f20e(t,c,p,R):
    first=t==0;y=f"{c}$3";on=f"AND({y}>=1,{y}<={I['hold']})";LN=f"{I['cost']}*{I['ltc']}"
    occ=lambda r,sh:f"IF({on},MIN(Levels!$B${r}*{I['stab']},(({y}-0.5)*12*{I['absm']})*Levels!$E${r}),0)"
    pay=f"PMT({I['rate']},{I['am']},-{LN})"
    return {'Year':t,'IL occupied':occ(2,0),'AL occupied':occ(3,0),'MC occupied':occ(4,0),
     'Revenue':f"12*({c}{R['IL occupied']}*Levels!$C$2+{c}{R['AL occupied']}*Levels!$C$3+{c}{R['MC occupied']}*Levels!$C$4)*(1+{I['feeg']})^MAX(0,{y}-1)",
     'Care hours needed':f"365*({c}{R['IL occupied']}*Levels!$D$2+{c}{R['AL occupied']}*Levels!$D$3+{c}{R['MC occupied']}*Levels!$D$4)",
     'In-house hours':f"MIN({c}{R['Care hours needed']},{I['fte']}*{I['hrs']})",'Agency hours':f"{c}{R['Care hours needed']}-{c}{R['In-house hours']}",
     'Care labour':f"({c}{R['In-house hours']}+{c}{R['Agency hours']}*(1+{I['agency']}))*{I['wage']}*(1+{I['wageg']})^MAX(0,{y}-1)",
     'Other opex':f"12*{I['opex']}*({c}{R['IL occupied']}+{c}{R['AL occupied']}+{c}{R['MC occupied']})*(1+0.03)^MAX(0,{y}-1)",'Management fee':f"{c}{R['Revenue']}*{I['mgmt']}",
     'Capital reserve':f"IF({on},{I['res']}*SUM(Levels!$B$2:$B$4),0)",'NOI':f"{c}{R['Revenue']}-{c}{R['Care labour']}-{c}{R['Other opex']}-{c}{R['Management fee']}-{c}{R['Capital reserve']}",
     'Loan balance':LN if first else f"IF({y}>={I['hold']},0,{p}{R['Loan balance']}-{c}{R['Principal']})",'Interest':'0' if first else f"IF({on},{p}{R['Loan balance']}*{I['rate']},0)",
     'Principal':'0' if first else f"IF({on},{pay}-{c}{R['Interest']},0)",'Debt service':f"{c}{R['Interest']}+{c}{R['Principal']}",'DSCR':f"IF({c}{R['Debt service']}>0,{c}{R['NOI']}/{c}{R['Debt service']},99)",
     'Sale':f"IF({y}={I['hold']},{c}{R['NOI']}*(1+{I['feeg']})/{I['exit']}-({p}{R['Loan balance']}-{c}{R['Principal']}),0)" if not first else '0',
     'Equity cash flow':f"-{I['cost']}*(1-{I['ltc']})" if first else f"{c}{R['NOI']}-{c}{R['Debt service']}+{c}{R['Sale']}"}
R=timeline(cf,labs,T,f20e);E=L(T+2);row=lambda n:f"'Cash Flow'!B{R[n]}:{E}{R[n]}"
table(wb.create_sheet('Returns'),[('Levered IRR',f"=IRR({row('Equity cash flow')})",P),('Equity multiple',f"=SUMIF({row('Equity cash flow')},\">0\")/-SUMIF({row('Equity cash flow')},\"<0\")",X),
 ('Minimum DSCR from year 3',f"=MIN('Cash Flow'!E{R['DSCR']}:{E}{R['DSCR']})",X),('Agency labour, year 5 (C$)',f"='Cash Flow'!G{R['Agency hours']}*{I['wage']}*(1+{I['agency']})*(1+{I['wageg']})^4",N),
 ('NOI margin, year 5',f"='Cash Flow'!G{R['NOI']}/'Cash Flow'!G{R['Revenue']}",P),('Net profit (C$)',f"=SUM({row('Equity cash flow')})",N)])
wb.save(OUT+'senior_cad.xlsx')
print('ok')

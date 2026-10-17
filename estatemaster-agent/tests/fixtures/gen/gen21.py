# round 21: a CIO's desk at the limit of complexity, several projects and a fund open at once
#  fundc    - USD opportunity fund consolidating FOUR deal sheets, each a full quarterly cash flow with its own loan (one a development
#             with interest capitalised: circular); fund facility; fees on commitments then on NAV; three-tier waterfall with full
#             catch-up; per-deal exit caps picked by a fund-wide case switch (Fund!Case: Base / Downside / Upside); XIRR on dates; DPI by year
#  master   - SAR masterplan, 48 quarters: six phases (plots, villas, BTR, hotel, retail, offices) with phase starts and build lengths,
#             infrastructure allocated by GFA, escrow release tied to construction progress, VAT on commercial sales, zakat on
#             positive cumulative profit, murabaha with profit capitalised during build (circular), scenario table on prices/costs/yields
#  eurolog  - EUR logistics portfolio: eight assets in four countries, rents in local currency with per-country FX and CPI
#             (floors/caps), lease by lease with expiry dates, disposals on dates, portfolio loan with LTV covenant and cash trap, XIRR
#  twotier  - USD co-investment through a GP vehicle into a developer JV: a deal-level promote waterfall (developer vs capital)
#             feeding a vehicle-level waterfall (LP vs GP, catch-up, clawback at the end); monthly; construction loan interest capitalised
#  ppp      - GBP availability PPP, semi-annual with dates: sculpted senior debt to a target DSCR on the lenders' case, DSRA, major
#             maintenance reserve funded ahead of a lifecycle table, capital allowances pool, corporation tax, deductions for
#             unavailability, sponsor case vs lenders' case switch, LLCR / PLCR / min DSCR / equity IRR
import openpyxl,os,math,datetime
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.defined_name import DefinedName
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m21/';os.makedirs(OUT+'calc',exist_ok=True)
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
def sh(ws):return f"'{ws.title}'" if ' ' in ws.title else ws.title

# ================= 21A fund consolidating four deal sheets =================
wb=openpyxl.Workbook()
fd=wb.active;fd.title='Fund';fd['A1']='ATLAS OPPORTUNITY FUND III – FUND MODEL WITH FOUR DEALS (USD)'
F=inputs(fd,[('case','Case (1 Base, 2 Downside, 3 Upside)',1,'0'),('commit','Commitments ($)',400000000,N),('start','First close',datetime.date(2026,3,31),D),('fee1','Management fee on commitments (first 3 years)',0.0175,P),
 ('fee2','Management fee on invested capital (after)',0.0125,P),('fac','Fund facility (% of a call, bridged two quarters)',1.0,P),('facr','Fund facility rate',0.065,P),('pref','Preferred return',0.08,P),('cu','GP catch-up',1.0,P),('carry','Carried interest',0.2,P),('hurdle2','Second hurdle IRR',0.15,P),('carry2','Carry above the second hurdle',0.3,P)])
wb.defined_names['Fund_Case']=DefinedName('Fund_Case',attr_text=F['case'].replace('Fund!','Fund!'))
T=32
deals=[('Deal A Logistics',dict(kind='income',eq=60e6,noi=8.6e6,g=0.03,ltv=0.55,rate=0.058,q0=1,hold=20,caps=(0.0575,0.065,0.0525))),
 ('Deal B Resi Dev',dict(kind='dev',eq=70e6,cost=180e6,rev=265e6,ltc=0.6,rate=0.075,q0=2,build=10,sell=6,caps=None)),
 ('Deal C Office',dict(kind='income',eq=55e6,noi=9.4e6,g=0.02,ltv=0.6,rate=0.061,q0=3,hold=24,caps=(0.07,0.08,0.0625))),
 ('Deal D Hotel',dict(kind='income',eq=45e6,noi=6.9e6,g=0.04,ltv=0.5,rate=0.07,q0=5,hold=22,caps=(0.075,0.0875,0.0675)))]
DR={}
for nm,d in deals:
    ws=wb.create_sheet(nm);ws['A1']=nm.upper()
    if d['kind']=='income':
        I=inputs(ws,[('eq','Equity ($)',d['eq'],N),('noi','NOI year 1 ($)',d['noi'],N),('g','NOI growth',d['g'],P),('ltv','Loan to value',d['ltv'],P),('rate','Interest rate',d['rate'],P),('q0','Acquisition quarter',d['q0'],'0'),('hold','Hold (quarters)',d['hold'],'0'),
            ('cap1','Exit cap · Base',d['caps'][0],P),('cap2','Exit cap · Downside',d['caps'][1],P),('cap3','Exit cap · Upside',d['caps'][2],P)])
        ws['A14']='Exit cap (live case)';ws['B14']=f"=CHOOSE(Fund_Case,{I['cap1']},{I['cap2']},{I['cap3']})";ws['B14'].number_format=P
        price=f"({I['eq']}/(1-{I['ltv']}))"
        def fx(t,c,p,R,I=I,price=price):
            q=f"{c}${R['Quarter']}";on=f"AND({q}>{I['q0']},{q}<={I['q0']}+{I['hold']})";ex=f"({q}={I['q0']}+{I['hold']})"
            return {'Quarter':t,'NOI':f"IF({on},{I['noi']}/4*(1+{I['g']})^(({q}-{I['q0']}-1)/4),0)",'Interest':f"IF({on},{price}*{I['ltv']}*{I['rate']}/4,0)",
             'Purchase':f"IF({q}={I['q0']},-{I['eq']},0)",'Sale':f"IF({ex},{c}{R['NOI']}*4*(1+{I['g']})/$B$14-{price}*{I['ltv']},0)",
             'Equity cash flow':f"{c}{R['Purchase']}+{c}{R['NOI']}-{c}{R['Interest']}+{c}{R['Sale']}"}
        R=timeline(ws,['Quarter','NOI','Interest','Purchase','Sale','Equity cash flow'],T,fx,first_row=17)
    else:
        I=inputs(ws,[('eq','Equity ($)',d['eq'],N),('cost','Development cost ex interest ($)',d['cost'],N),('rev','Sales revenue ($)',d['rev'],N),('ltc','Loan to cost (ex interest)',d['ltc'],P),('rate','Loan rate',d['rate'],P),
            ('q0','Start quarter',d['q0'],'0'),('build','Build (quarters)',d['build'],'0'),('sell','Sales period (quarters)',d['sell'],'0'),('ovr','Cost overrun',0.0,P)])
        def fx(t,c,p,R,I=I):
            q=f"{c}${R['Quarter']}";first=t==0;bld=f"AND({q}>={I['q0']},{q}<{I['q0']}+{I['build']})";sl=f"AND({q}>={I['q0']}+{I['build']},{q}<{I['q0']}+{I['build']}+{I['sell']})"
            tot=f"{I['cost']}*(1+{I['ovr']})"
            return {'Quarter':t,'Build cost':f"IF({bld},{I['cost']}*(1+{I['ovr']})/{I['build']},0)",'Interest capitalised':'0' if first else f"{p}{R['Loan balance']}*{I['rate']}/4",
             'Total cost':f"{c}{R['Build cost']}+{c}{R['Interest capitalised']}",'Equity drawn':f"MIN({c}{R['Total cost']},MAX(0,(1-{I['ltc']})*{tot}-{'0' if first else p+str(R['Cumulative equity'])}))",
             'Cumulative equity':f"{c}{R['Equity drawn']}" if first else f"{p}{R['Cumulative equity']}+{c}{R['Equity drawn']}",'Loan drawn':f"{c}{R['Total cost']}-{c}{R['Equity drawn']}",
             'Revenue':f"IF({sl},{I['rev']}/{I['sell']},0)",'Repayment':f"MIN({c}{R['Revenue']},{'0' if first else p+str(R['Loan balance'])}+{c}{R['Loan drawn']})",
             'Loan balance':f"{'0' if first else p+str(R['Loan balance'])}+{c}{R['Loan drawn']}-{c}{R['Repayment']}",
             'Equity cash flow':f"{c}{R['Revenue']}-{c}{R['Repayment']}-{c}{R['Equity drawn']}"}
        R=timeline(ws,['Quarter','Build cost','Interest capitalised','Total cost','Equity drawn','Cumulative equity','Loan drawn','Revenue','Repayment','Loan balance','Equity cash flow'],T,fx,first_row=17)
    DR[nm]=(ws,R)
    ws.cell(R['Equity cash flow']+2,1,'Deal IRR');c=ws.cell(R['Equity cash flow']+2,2,f"=(1+IRR(B{R['Equity cash flow']}:{L(T+2)}{R['Equity cash flow']},0.02))^4-1");c.number_format=P
    ws.cell(R['Equity cash flow']+3,1,'Deal equity multiple');c=ws.cell(R['Equity cash flow']+3,2,f"=SUMIF(B{R['Equity cash flow']}:{L(T+2)}{R['Equity cash flow']},\">0\")/-SUMIF(B{R['Equity cash flow']}:{L(T+2)}{R['Equity cash flow']},\"<0\")");c.number_format=X
cf=wb.create_sheet('Cash Flow')
labs=['Quarter','Date','Deal cash flow (equity)','Deal contributions','Deal distributions','Invested capital','Management fee','Facility drawn','Facility repaid','Facility interest','Facility balance','Capital called','LP contributions','Distributable',
 'ROC account','Return of capital','Pref account','Pref paid','Catch-up account','Catch-up to GP','Tier 2 account (15%)','Tier 2 split LP','Tier 2 split GP','Above tier 2 LP','Above tier 2 GP','LP distributions','GP carry','LP net cash flow','Cumulative LP distributions','DPI']
dcf=lambda c:'+'.join(f"{sh(DR[n][0])}!{c}{DR[n][1]['Equity cash flow']}" for n in DR)
def ffx(t,c,p,R):
    first=t==0;q=f"{c}$3";prevd=f"({c}{R['Date']}-91)" if first else f"{p}{R['Date']}"
    back=lambda n:f"{L(t+2-n)}{R['Facility drawn']}" if t>=n else '0'
    return {'Quarter':t,'Date':f"EOMONTH({F['start']},3*{q})",'Deal cash flow (equity)':dcf(c),'Deal contributions':f"MAX(0,-{c}{R['Deal cash flow (equity)']})",'Deal distributions':f"MAX(0,{c}{R['Deal cash flow (equity)']})",
     'Invested capital':f"{c}{R['Deal contributions']}" if first else f"{p}{R['Invested capital']}+{c}{R['Deal contributions']}-MIN({c}{R['Deal distributions']},{p}{R['Invested capital']})",
     'Management fee':f"IF({q}<12,{F['commit']}*{F['fee1']},{c}{R['Invested capital']}*{F['fee2']})/4",
     'Facility drawn':f"{c}{R['Deal contributions']}*{F['fac']}",'Facility repaid':back(2),'Facility interest':'0' if first else f"{p}{R['Facility balance']}*{F['facr']}/4",
     'Facility balance':f"{c}{R['Facility drawn']}-{c}{R['Facility repaid']}" if first else f"{p}{R['Facility balance']}+{c}{R['Facility drawn']}-{c}{R['Facility repaid']}",
     'Capital called':f"{c}{R['Deal contributions']}-{c}{R['Facility drawn']}+{c}{R['Facility repaid']}+{c}{R['Management fee']}+{c}{R['Facility interest']}",'LP contributions':f"{c}{R['Capital called']}",
     'Distributable':f"{c}{R['Deal distributions']}",
     'ROC account':f"{c}{R['LP contributions']}" if first else f"{p}{R['ROC account']}-{p}{R['Return of capital']}+{c}{R['LP contributions']}",'Return of capital':f"MIN({c}{R['Distributable']},{c}{R['ROC account']})",
     'Pref account':'0' if first else f"({p}{R['Pref account']}-{p}{R['Pref paid']})*(1+{F['pref']})^0.25+({p}{R['ROC account']}-{p}{R['Return of capital']})*((1+{F['pref']})^0.25-1)",
     'Pref paid':f"MIN({c}{R['Distributable']}-{c}{R['Return of capital']},{c}{R['Pref account']})",
     'Catch-up account':f"{c}{R['Pref paid']}*{F['carry']}/(1-{F['carry']})" if first else f"{p}{R['Catch-up account']}-{p}{R['Catch-up to GP']}+{c}{R['Pref paid']}*{F['carry']}/(1-{F['carry']})",
     'Catch-up to GP':f"MIN(({c}{R['Distributable']}-{c}{R['Return of capital']}-{c}{R['Pref paid']})*{F['cu']},{c}{R['Catch-up account']})",
     'Tier 2 account (15%)':'0' if first else f"MAX(0,({p}{R['Tier 2 account (15%)']}+{p}{R['LP contributions']})*(1+{F['hurdle2']})^0.25-{p}{R['LP distributions']})",
     'Tier 2 split LP':f"MIN({c}{R['Distributable']}-{c}{R['Return of capital']}-{c}{R['Pref paid']}-{c}{R['Catch-up to GP']},MAX(0,{c}{R['Tier 2 account (15%)']}-{c}{R['Return of capital']}-{c}{R['Pref paid']})/(1-{F['carry']}))*(1-{F['carry']})",
     'Tier 2 split GP':f"{c}{R['Tier 2 split LP']}*{F['carry']}/(1-{F['carry']})",
     'Above tier 2 LP':f"({c}{R['Distributable']}-{c}{R['Return of capital']}-{c}{R['Pref paid']}-{c}{R['Catch-up to GP']}-{c}{R['Tier 2 split LP']}-{c}{R['Tier 2 split GP']})*(1-{F['carry2']})",
     'Above tier 2 GP':f"({c}{R['Distributable']}-{c}{R['Return of capital']}-{c}{R['Pref paid']}-{c}{R['Catch-up to GP']}-{c}{R['Tier 2 split LP']}-{c}{R['Tier 2 split GP']})*{F['carry2']}",
     'LP distributions':f"{c}{R['Return of capital']}+{c}{R['Pref paid']}+{c}{R['Tier 2 split LP']}+{c}{R['Above tier 2 LP']}",'GP carry':f"{c}{R['Catch-up to GP']}+{c}{R['Tier 2 split GP']}+{c}{R['Above tier 2 GP']}",
     'LP net cash flow':f"{c}{R['LP distributions']}-{c}{R['LP contributions']}",'Cumulative LP distributions':f"{c}{R['LP distributions']}" if first else f"{p}{R['Cumulative LP distributions']}+{c}{R['LP distributions']}",
     'DPI':f"IF(SUM($B${R['LP contributions']}:{c}{R['LP contributions']})>0,{c}{R['Cumulative LP distributions']}/SUM($B${R['LP contributions']}:{c}{R['LP contributions']}),0)"}
R=timeline(cf,labs,T,ffx);E=L(T+2);row=lambda n:f"'Cash Flow'!B{R[n]}:{E}{R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
table(wb.create_sheet('Returns'),[('Gross IRR (deals, XIRR)',f"=XIRR({row('Deal cash flow (equity)')},{row('Date')})",P),('LP net IRR (XIRR)',f"=XIRR({row('LP net cash flow')},{row('Date')})",P),
 ('LP TVPI',f"=SUM({row('LP distributions')})/SUM({row('LP contributions')})",X),('DPI at year 4',f"='Cash Flow'!R{R['DPI']}",X),('GP carried interest ($)',f"=SUM({row('GP carry')})",N),
 ('Management fees ($)',f"=SUM({row('Management fee')})",N),('Facility interest ($)',f"=SUM({row('Facility interest')})",N),('Total called ($)',f"=SUM({row('LP contributions')})",N),('Peak facility ($)',f"=MAX({row('Facility balance')})",N),
 ('Deal A IRR',f"='Deal A Logistics'!B{DR['Deal A Logistics'][1]['Equity cash flow']+2}",P),('Deal B IRR',f"='Deal B Resi Dev'!B{DR['Deal B Resi Dev'][1]['Equity cash flow']+2}",P),('Deal C IRR',f"='Deal C Office'!B{DR['Deal C Office'][1]['Equity cash flow']+2}",P),('Deal D IRR',f"='Deal D Hotel'!B{DR['Deal D Hotel'][1]['Equity cash flow']+2}",P)])
wb.save(OUT+'fundc_usd.xlsx')

# ================= 21B masterplan with escrow, VAT, zakat, circular murabaha =================
wb=openpyxl.Workbook()
ws=wb.active;ws.title='Inputs';ws['A1']='WADI AL NOOR MASTERPLAN – SIX PHASES (SAR)'
I=inputs(ws,[('case','Scenario (1 Base, 2 Downside, 3 Upside)',1,'0'),('land','Land (SAR)',900000000,N),('infra','Infrastructure (SAR)',420000000,N),('infrad','Infrastructure build (quarters)',8,'0'),('vat','VAT on commercial sales',0.15,P),
 ('zakat','Zakat',0.025,P),('ltc','Murabaha (% of phase cost)',0.6,P),('mr','Murabaha profit rate (capitalised during build)',0.07,P),('esc','Escrow: share of collections released by progress',0.7,P),('disc','Discount rate',0.11,P)])
sc=wb.create_sheet('Scenarios');sc.append(['Assumption','Base','Downside','Upside','Live'])
S={}
for i,(l,b,d_,u,fm) in enumerate([('Plot price (SAR/sqm)',3200,2700,3500,N),('Villa price (SAR/sqm)',8800,7600,9500,N),('BTR rent (SAR/sqm/yr)',950,820,1020,N),('Hotel ADR (SAR)',900,760,980,N),('Retail rent (SAR/sqm/yr)',1700,1450,1850,N),('Office rent (SAR/sqm/yr)',1150,980,1250,N),('Build cost (SAR/sqm)',4300,4800,4150,N),('Exit yield (income phases)',0.075,0.0875,0.07,P)],start=2):
    sc.cell(i,1,l)
    for j,v in enumerate([b,d_,u],start=2):c=sc.cell(i,j,v);c.number_format=fm
    c=sc.cell(i,5,f"=CHOOSE({I['case']},B{i},C{i},D{i})");c.number_format=fm;S[l]=f"Scenarios!$E${i}"
ph=wb.create_sheet('Phases');ph.append(['Phase','Type','GFA / land (sqm)','Start quarter','Build (quarters)','Sales / lease-up (quarters)','Commercial (VAT)'])
phases=[('Plots','sale',220000,1,6,8,0),('Villas','sale',130000,3,8,8,0),('BTR','income',90000,6,9,0,0),('Hotel','hotel',40000,9,10,0,1),('Retail','income',35000,8,8,0,1),('Offices','income',60000,12,10,0,1)]
for i,pp in enumerate(phases,start=2):
    for j,v in enumerate(pp,start=1):ph.cell(i,j,v)
cf=wb.create_sheet('Cash Flow');T=48;cf['A3']='Quarter'
for t in range(T+1):cf[f'{L(t+2)}3']=t
row=4;PH={}
for k,(nm,typ,gfa,q0,bq,sq,com) in enumerate(phases):
    r0=k+2;g=lambda col:f"Phases!${col}${r0}"
    labs=['build cost','revenue','collections released','NOI'];rows={}
    for lab in labs:rows[lab]=row;cf.cell(row,1,f'{nm} · {lab}');row+=1
    PH[nm]=rows
    for t in range(T+1):
        c=L(t+2);q=f"{c}$3";bld=f"AND({q}>={g('D')},{q}<{g('D')}+{g('E')})";after=f"({q}>={g('D')}+{g('E')})"
        unit=f"{S['Build cost (SAR/sqm)']}*IF(\"{typ}\"=\"hotel\",1.6,IF(\"{nm}\"=\"Plots\",0.25,1))"
        cf[f"{c}{rows['build cost']}"]=f"=IF({bld},{g('C')}*{unit}/{g('E')},0)"
        if typ=='sale':
            price=S['Plot price (SAR/sqm)'] if nm=='Plots' else S['Villa price (SAR/sqm)']
            sl=f"AND({q}>={g('D')},{q}<{g('D')}+{g('F')})"
            cf[f"{c}{rows['revenue']}"]=f"=IF({sl},{g('C')}*{price}/{g('F')},0)*(1+{I['vat']}*{g('G')})"
            prog=f"MIN(1,MAX(0,({q}-{g('D')}+1)/{g('E')}))"
            cf[f"{c}{rows['collections released']}"]=f"=IF({q}<{g('D')}+{g('E')}-1,{c}{rows['revenue']}*(1-{I['esc']})+{I['esc']}*SUM($B${rows['revenue']}:{c}{rows['revenue']})*{prog}-{I['esc']}*SUM($B${rows['revenue']}:{L(t+1) if t else 'B'}{rows['revenue']})*MIN(1,MAX(0,({q}-{g('D')})/{g('E')})),SUM($B${rows['revenue']}:{c}{rows['revenue']})-SUM($B${rows['collections released']}:{L(t+1) if t else 'B'}{rows['collections released']})+IF({q}>={g('D')}+{g('E')}-1,0,0))" if t else f"={c}{rows['revenue']}*(1-{I['esc']})"
            cf[f"{c}{rows['NOI']}"]="=0"
        else:
            rent=S['Hotel ADR (SAR)'] if typ=='hotel' else (S['BTR rent (SAR/sqm/yr)'] if nm=='BTR' else (S['Retail rent (SAR/sqm/yr)'] if nm=='Retail' else S['Office rent (SAR/sqm/yr)']))
            noi=f"{g('C')}*{rent}*0.9/4" if typ!='hotel' else f"{g('C')}/45*{rent}*365*0.68*0.38/4"
            ramp=f"MIN(1,({q}-{g('D')}-{g('E')}+1)/6)"
            cf[f"{c}{rows['revenue']}"]="=0";cf[f"{c}{rows['collections released']}"]="=0"
            cf[f"{c}{rows['NOI']}"]=f"=IF({after},{noi}*{ramp}*1.025^INT(({q}-{g('D')}-{g('E')})/4),0)"
tot={}
for lab in ['Land','Infrastructure','Build cost','Collections','NOI','Exit value','Total cost','Murabaha drawn','Murabaha profit','Murabaha repaid','Murabaha balance','Pre-zakat cash flow','Cumulative','Zakat','Unlevered cash flow','Equity cash flow']:tot[lab]=row;cf.cell(row,1,lab);row+=1
inc=[n for n,typ,*_ in phases if typ!='sale']
for t in range(T+1):
    c=L(t+2);p=L(t+1);q=f"{c}$3";first=t==0
    cf[f"{c}{tot['Land']}"]=f"=IF({q}=0,{I['land']},0)";cf[f"{c}{tot['Infrastructure']}"]=f"=IF(AND({q}>=1,{q}<={I['infrad']}),{I['infra']}/{I['infrad']},0)"
    cf[f"{c}{tot['Build cost']}"]='='+'+'.join(f"{c}{PH[n]['build cost']}" for n in PH)
    cf[f"{c}{tot['Collections']}"]='='+'+'.join(f"{c}{PH[n]['collections released']}" for n in PH)
    cf[f"{c}{tot['NOI']}"]='='+'+'.join(f"{c}{PH[n]['NOI']}" for n in PH)
    cf[f"{c}{tot['Exit value']}"]=f"=IF({q}={T},{c}{tot['NOI']}*4*1.025/{S['Exit yield (income phases)']},0)"
    cf[f"{c}{tot['Total cost']}"]=f"={c}{tot['Land']}+{c}{tot['Infrastructure']}+{c}{tot['Build cost']}"
    pb='0' if first else f"{p}{tot['Murabaha balance']}"
    cf[f"{c}{tot['Murabaha drawn']}"]=f"={c}{tot['Build cost']}*{I['ltc']}"
    cf[f"{c}{tot['Murabaha profit']}"]=f"={pb}*{I['mr']}/4"
    cf[f"{c}{tot['Murabaha repaid']}"]=f"=MIN({c}{tot['Collections']}+{c}{tot['NOI']}+{c}{tot['Exit value']},{pb}+{c}{tot['Murabaha drawn']}+{c}{tot['Murabaha profit']})"
    cf[f"{c}{tot['Murabaha balance']}"]=f"={pb}+{c}{tot['Murabaha drawn']}+{c}{tot['Murabaha profit']}-{c}{tot['Murabaha repaid']}"
    cf[f"{c}{tot['Pre-zakat cash flow']}"]=f"={c}{tot['Collections']}+{c}{tot['NOI']}+{c}{tot['Exit value']}-{c}{tot['Total cost']}"
    cf[f"{c}{tot['Cumulative']}"]=f"={c}{tot['Pre-zakat cash flow']}" if first else f"={p}{tot['Cumulative']}+{c}{tot['Pre-zakat cash flow']}"
    cf[f"{c}{tot['Zakat']}"]=f"=MAX(0,{c}{tot['Cumulative']})*{I['zakat']}" if first else f"=MAX(0,{c}{tot['Cumulative']})*{I['zakat']}-MAX(0,{p}{tot['Cumulative']})*{I['zakat']}"
    cf[f"{c}{tot['Unlevered cash flow']}"]=f"={c}{tot['Pre-zakat cash flow']}-{c}{tot['Zakat']}"
    cf[f"{c}{tot['Equity cash flow']}"]=f"={c}{tot['Unlevered cash flow']}+{c}{tot['Murabaha drawn']}-{c}{tot['Murabaha repaid']}"
E=L(T+2);rw=lambda r:f"'Cash Flow'!B{r}:{E}{r}";rwc=lambda r:f"'Cash Flow'!C{r}:{E}{r}"
table(wb.create_sheet('Returns'),[('Project IRR',f"=(1+IRR({rw(tot['Unlevered cash flow'])},0.02))^4-1",P),('Equity IRR',f"=(1+IRR({rw(tot['Equity cash flow'])},0.02))^4-1",P),('NPV (SAR)',f"=NPV((1+{I['disc']})^0.25-1,{rwc(tot['Unlevered cash flow'])})+'Cash Flow'!B{tot['Unlevered cash flow']}",N),
 ('Net profit (SAR)',f"=SUM({rw(tot['Unlevered cash flow'])})",N),('Total development cost (SAR)',f"=SUM({rw(tot['Total cost'])})+SUM({rw(tot['Murabaha profit'])})",N),('Gross revenue (SAR)',f"=SUM({rw(tot['Collections'])})+SUM({rw(tot['NOI'])})+SUM({rw(tot['Exit value'])})",N),
 ('Peak murabaha (SAR)',f"=MAX({rw(tot['Murabaha balance'])})",N),('Profit capitalised (SAR)',f"=SUM({rw(tot['Murabaha profit'])})",N),('Zakat paid (SAR)',f"=SUM({rw(tot['Zakat'])})",N),('Escrow held at horizon (SAR)',"=SUM("+','.join(rw(PH[n]['revenue']) for n in PH)+")-SUM("+','.join(rw(PH[n]['collections released']) for n in PH)+")",N)])
wb.save(OUT+'master_sar.xlsx')

# ================= 21C European logistics portfolio =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='NORTHGATE EUROPEAN LOGISTICS – EIGHT ASSETS, FOUR COUNTRIES (EUR)'
I=inputs(ws,[('val','Valuation date',datetime.date(2026,1,1),D),('price','Portfolio price (EUR)',610000000,N),('costs','Purchase costs',0.04,P),('ltv','Loan to value',0.5,P),('rate','All-in rate',0.045,P),('cov','LTV covenant',0.6,P),('trap','Cash trap LTV',0.55,P),
 ('exit','Exit yield (blended)',0.055,P),('hold','Hold (years)',7,'0'),('void','Void on expiry (months)',9,'0'),('renew','Renewal probability',0.6,P),('mgmt','Non-recoverable (% of rent)',0.03,P)])
ct=wb.create_sheet('Countries');ct.append(['Country','Currency','FX to EUR','CPI','Indexation floor','Indexation cap'])
for i,r in enumerate([('Germany','EUR',1.0,0.022,0.0,0.05),('Poland','PLN',0.2315,0.045,0.01,0.04),('Sweden','SEK',0.0875,0.02,0.0,0.03),('UK','GBP',1.17,0.03,0.01,0.05)],start=2):
    for j,v in enumerate(r,start=1):c=ct.cell(i,j,v);c.number_format=P if j>=4 else ('0.0000' if j==3 else 'General')
asx=wb.create_sheet('Assets');asx.append(['Asset','Country','Area (sqm)','Rent (local/sqm/yr)','Lease expiry','ERV (local/sqm/yr)','Disposal date','Disposal yield'])
A=[('Hamburg Nord',  'Germany',48000,62,datetime.date(2031,3,31),66,None,None),('Leipzig Park','Germany',61000,55,datetime.date(2028,9,30),60,datetime.date(2029,12,31),0.052),
   ('Warsaw West','Poland',72000,260,datetime.date(2030,6,30),280,None,None),('Lodz Hub','Poland',55000,240,datetime.date(2027,12,31),265,None,None),
   ('Malmo Gate','Sweden',38000,780,datetime.date(2032,12,31),800,None,None),('Gothenburg Port','Sweden',44000,760,datetime.date(2029,6,30),810,datetime.date(2030,6,30),0.05),
   ('Midlands Cross','UK',66000,88,datetime.date(2033,3,31),96,None,None),('Thames Gateway','UK',52000,98,datetime.date(2028,3,31),104,None,None)]
for i,r in enumerate(A,start=2):
    for j,v in enumerate(r,start=1):
        if v is None:continue
        c=asx.cell(i,j,v);c.number_format=D if isinstance(v,datetime.date) else (P if j==8 else ('#,##0.00' if j in (4,6) else 'General'))
cf=wb.create_sheet('Cash Flow');Y=10;cf['A3']='Year';cf['A4']='Year start'
for y in range(0,Y+1):c=L(y+2);cf[f'{c}3']=y;cf[f'{c}4']=f"=EDATE({I['val']},12*{c}3)";cf[f'{c}4'].number_format=D
row=5;AR={}
for k,a in enumerate(A):
    r0=k+2;g=lambda col:f"Assets!${col}${r0}";cty=f"MATCH({g('B')},Countries!$A$2:$A$5,0)";fx=f"INDEX(Countries!$C$2:$C$5,{cty})";cpi=f"MIN(INDEX(Countries!$F$2:$F$5,{cty}),MAX(INDEX(Countries!$E$2:$E$5,{cty}),INDEX(Countries!$D$2:$D$5,{cty})))"
    rows={};
    for lab in ['rent (EUR)','disposal (EUR)']:rows[lab]=row;cf.cell(row,1,f'{a[0]} · {lab}');row+=1
    AR[a[0]]=rows
    for y in range(0,Y+1):
        c=L(y+2);ys=f"{c}$4";ye=f"EDATE({c}$4,12)";on=f"AND({c}$3>=1,{c}$3<={I['hold']},OR({g('G')}=\"\",{ys}<{g('G')}))"
        exp=g('E');idx=f"(1+{cpi})^({c}$3-1)"
        before=f"MAX(0,MIN(1,YEARFRAC({ys},MIN({exp},{ye}),1)*({exp}>{ys})))"
        mo=f"MAX(0,MIN(12,DATEDIF(MAX({exp},{ys}),{ye},\"m\")))";gone=f"IF({exp}<{ys},DATEDIF({exp},{ys},\"m\"),0)"
        after=f"IF({exp}<{ye},({I['renew']}*{mo}+(1-{I['renew']})*MAX(0,{mo}-MAX(0,{I['void']}-{gone})))/12,0)"
        cf[f"{c}{rows['rent (EUR)']}"]=f"=IF({on},{g('C')}*({g('D')}*{idx}*{before}+{g('F')}*{idx}*{after})*{fx},0)"
        cf[f"{c}{rows['disposal (EUR)']}"]=f"=IF(AND({g('G')}<>\"\",{g('G')}>={ys},{g('G')}<{ye}),{g('C')}*{g('F')}*{idx}*{fx}/{g('H')},0)"
tot={}
for lab in ['Rent (EUR)','Non-recoverable','NOI','Disposals','Exit','Loan','Interest','Value (EUR)','LTV','Cash trap','Equity cash flow','Unlevered cash flow']:tot[lab]=row;cf.cell(row,1,lab);row+=1
for y in range(0,Y+1):
    c=L(y+2);p=L(y+1);q=f"{c}$3";first=y==0;LN=f"{I['price']}*{I['ltv']}"
    cf[f"{c}{tot['Rent (EUR)']}"]='='+'+'.join(f"{c}{AR[a]['rent (EUR)']}" for a in AR)
    cf[f"{c}{tot['Non-recoverable']}"]=f"={c}{tot['Rent (EUR)']}*{I['mgmt']}";cf[f"{c}{tot['NOI']}"]=f"={c}{tot['Rent (EUR)']}-{c}{tot['Non-recoverable']}"
    cf[f"{c}{tot['Disposals']}"]='='+'+'.join(f"{c}{AR[a]['disposal (EUR)']}" for a in AR)
    cf[f"{c}{tot['Exit']}"]=f"=IF({q}={I['hold']},{c}{tot['NOI']}*1.02/{I['exit']},0)"
    cf[f"{c}{tot['Loan']}"]=f"=IF({q}=0,{LN},IF({q}>={I['hold']},0,{p}{tot['Loan']}-MIN({p}{tot['Loan']},{c}{tot['Disposals']}+{c}{tot['Cash trap']})))" if not first else f"={LN}"
    cf[f"{c}{tot['Interest']}"]=f"=IF(AND({q}>=1,{q}<={I['hold']}),{p}{tot['Loan']}*{I['rate']},0)" if not first else "=0"
    cf[f"{c}{tot['Value (EUR)']}"]=f"=IF({q}=0,'Cash Flow'!C{tot['NOI']},{c}{tot['NOI']})/{I['exit']}"
    cf[f"{c}{tot['LTV']}"]=f"=IF({c}{tot['Value (EUR)']}>0,{p if not first else c}{tot['Loan']}/{c}{tot['Value (EUR)']},0)"
    cf[f"{c}{tot['Cash trap']}"]=f"=IF(AND({q}>=1,{q}<{I['hold']},{c}{tot['LTV']}>{I['trap']}),MAX(0,{c}{tot['NOI']}-{c}{tot['Interest']}),0)"
    cf[f"{c}{tot['Equity cash flow']}"]=f"=-{I['price']}*(1+{I['costs']})+{LN}" if first else f"={c}{tot['NOI']}-{c}{tot['Interest']}+{c}{tot['Disposals']}+{c}{tot['Exit']}-({p}{tot['Loan']}-{c}{tot['Loan']})-{c}{tot['Cash trap']}+IF({q}={I['hold']},SUM($C${tot['Cash trap']}:{c}{tot['Cash trap']}),0)"
    cf[f"{c}{tot['Unlevered cash flow']}"]=f"=-{I['price']}*(1+{I['costs']})" if first else f"={c}{tot['NOI']}+{c}{tot['Disposals']}+{c}{tot['Exit']}"
E=L(Y+2);rw=lambda r:f"'Cash Flow'!B{r}:{E}{r}"
table(wb.create_sheet('Returns'),[('Levered IRR (XIRR)',f"=XIRR({rw(tot['Equity cash flow'])},'Cash Flow'!B4:{E}4)",P),('Unlevered IRR (XIRR)',f"=XIRR({rw(tot['Unlevered cash flow'])},'Cash Flow'!B4:{E}4)",P),
 ('Equity multiple',f"=SUMIF({rw(tot['Equity cash flow'])},\">0\")/-SUMIF({rw(tot['Equity cash flow'])},\"<0\")",X),('Net profit (EUR)',f"=SUM({rw(tot['Equity cash flow'])})",N),('Peak LTV',f"=MAX('Cash Flow'!C{tot['LTV']}:{E}{tot['LTV']})",P),
 ('Years in cash trap',f"=COUNTIF('Cash Flow'!C{tot['Cash trap']}:{E}{tot['Cash trap']},\">0\")",'0'),('Year 1 NOI (EUR)',f"='Cash Flow'!C{tot['NOI']}",N),('Disposal proceeds (EUR)',f"=SUM({rw(tot['Disposals'])})",N),('Covenant breached',f"=IF(B7>{I['cov']},\"Yes\",\"No\")",'@')])
wb.save(OUT+'eurolog_eur.xlsx')

# ================= 21D two-tier waterfall co-investment =================
wb=openpyxl.Workbook()
ws=wb.active;ws.title='Inputs';ws['A1']='PIER 9 CO-INVESTMENT – TWO-TIER WATERFALL (USD)'
I=inputs(ws,[('cost','Project cost ex interest ($)',240000000,N),('ltc','Construction loan to cost (ex interest)',0.6,P),('rate','Loan rate',0.08,P),('build','Build (months)',24,'0'),('rev','Revenue ($)',345000000,N),('sstart','Sales start (month)',22,'0'),('sper','Sales period (months)',18,'0'),
 ('dev','Developer co-invest (% of equity)',0.1,P),('dpref','Deal pref',0.09,P),('dprom','Developer promote above pref',0.25,P),('vgp','GP commitment (% of vehicle)',0.05,P),('vpref','Vehicle pref',0.08,P),('vcarry','Vehicle carry',0.2,P),('vcu','Vehicle catch-up share',0.8,P)])
cf=wb.create_sheet('Cash Flow');T=48
labs=['Month','Build cost','Interest capitalised','Total cost','Equity drawn','Cumulative equity','Loan drawn','Revenue','Repayment','Loan balance','Deal equity cash flow',
 'Capital partner contribution','Developer contribution','Distributions','Deal ROC','Deal pref account','Deal pref paid','Promote','Capital partner share','Developer total','Capital partner cash flow',
 'LP contribution','GP contribution','Vehicle ROC','Vehicle pref account','Vehicle pref paid','Vehicle catch-up account','Catch-up to GP','Split LP','Split GP','LP cash flow','GP cash flow']
def wfx(t,c,p,R):
    first=t==0;m=f"{c}$3";bld=f"AND({m}>=1,{m}<={I['build']})";sl=f"AND({m}>={I['sstart']},{m}<{I['sstart']}+{I['sper']})";tot=f"{I['cost']}"
    pb='0' if first else f"{p}{R['Loan balance']}";cap=f"(1-{I['dev']})";mp=f"((1+{I['dpref']})^(1/12)-1)";vp=f"((1+{I['vpref']})^(1/12)-1)"
    return {'Month':t,'Build cost':f"IF({bld},{I['cost']}/{I['build']},0)",'Interest capitalised':'0' if first else f"{pb}*{I['rate']}/12",'Total cost':f"{c}{R['Build cost']}+{c}{R['Interest capitalised']}",
     'Equity drawn':f"MIN({c}{R['Total cost']},MAX(0,(1-{I['ltc']})*{tot}-{'0' if first else p+str(R['Cumulative equity'])}))",'Cumulative equity':f"{c}{R['Equity drawn']}" if first else f"{p}{R['Cumulative equity']}+{c}{R['Equity drawn']}",
     'Loan drawn':f"{c}{R['Total cost']}-{c}{R['Equity drawn']}",'Revenue':f"IF({sl},{I['rev']}/{I['sper']},0)",'Repayment':f"MIN({c}{R['Revenue']},{pb}+{c}{R['Loan drawn']})",'Loan balance':f"{pb}+{c}{R['Loan drawn']}-{c}{R['Repayment']}",
     'Deal equity cash flow':f"{c}{R['Revenue']}-{c}{R['Repayment']}-{c}{R['Equity drawn']}",
     'Capital partner contribution':f"{c}{R['Equity drawn']}*{cap}",'Developer contribution':f"{c}{R['Equity drawn']}*{I['dev']}",'Distributions':f"{c}{R['Revenue']}-{c}{R['Repayment']}",
     'Deal ROC':f"MIN({c}{R['Distributions']},{'0' if first else 'SUM($B'+str(R['Equity drawn'])+':'+c+str(R['Equity drawn'])+')-SUM($B'+str(R['Deal ROC'])+':'+p+str(R['Deal ROC'])+')'})",
     'Deal pref account':'0' if first else f"({p}{R['Deal pref account']}-{p}{R['Deal pref paid']})*(1+{mp})+(SUM($B{R['Equity drawn']}:{p}{R['Equity drawn']})-SUM($B{R['Deal ROC']}:{p}{R['Deal ROC']}))*{mp}",
     'Deal pref paid':f"MIN({c}{R['Distributions']}-{c}{R['Deal ROC']},{c}{R['Deal pref account']})",'Promote':f"({c}{R['Distributions']}-{c}{R['Deal ROC']}-{c}{R['Deal pref paid']})*{I['dprom']}",
     'Capital partner share':f"({c}{R['Deal ROC']}+{c}{R['Deal pref paid']})*{cap}+({c}{R['Distributions']}-{c}{R['Deal ROC']}-{c}{R['Deal pref paid']}-{c}{R['Promote']})*{cap}",
     'Developer total':f"{c}{R['Distributions']}-{c}{R['Capital partner share']}",'Capital partner cash flow':f"{c}{R['Capital partner share']}-{c}{R['Capital partner contribution']}",
     'LP contribution':f"{c}{R['Capital partner contribution']}*(1-{I['vgp']})",'GP contribution':f"{c}{R['Capital partner contribution']}*{I['vgp']}",
     'Vehicle ROC':f"MIN({c}{R['Capital partner share']},{'0' if first else 'SUM($B'+str(R['Capital partner contribution'])+':'+c+str(R['Capital partner contribution'])+')-SUM($B'+str(R['Vehicle ROC'])+':'+p+str(R['Vehicle ROC'])+')'})",
     'Vehicle pref account':'0' if first else f"({p}{R['Vehicle pref account']}-{p}{R['Vehicle pref paid']})*(1+{vp})+(SUM($B{R['Capital partner contribution']}:{p}{R['Capital partner contribution']})-SUM($B{R['Vehicle ROC']}:{p}{R['Vehicle ROC']}))*{vp}",
     'Vehicle pref paid':f"MIN({c}{R['Capital partner share']}-{c}{R['Vehicle ROC']},{c}{R['Vehicle pref account']})",
     'Vehicle catch-up account':f"{c}{R['Vehicle pref paid']}*{I['vcarry']}/(1-{I['vcarry']})" if first else f"{p}{R['Vehicle catch-up account']}-{p}{R['Catch-up to GP']}+{c}{R['Vehicle pref paid']}*{I['vcarry']}/(1-{I['vcarry']})",
     'Catch-up to GP':f"MIN(({c}{R['Capital partner share']}-{c}{R['Vehicle ROC']}-{c}{R['Vehicle pref paid']})*{I['vcu']},{c}{R['Vehicle catch-up account']})",
     'Split LP':f"({c}{R['Capital partner share']}-{c}{R['Vehicle ROC']}-{c}{R['Vehicle pref paid']}-{c}{R['Catch-up to GP']})*(1-{I['vcarry']})",'Split GP':f"({c}{R['Capital partner share']}-{c}{R['Vehicle ROC']}-{c}{R['Vehicle pref paid']}-{c}{R['Catch-up to GP']})*{I['vcarry']}",
     'LP cash flow':f"({c}{R['Vehicle ROC']}+{c}{R['Vehicle pref paid']}+{c}{R['Split LP']})*(1-{I['vgp']})+{c}{R['Split LP']}*0-{c}{R['LP contribution']}",
     'GP cash flow':f"{c}{R['Capital partner cash flow']}-{c}{R['LP cash flow']}"}
R=timeline(cf,labs,T,wfx);E=L(T+2);row=lambda n:f"'Cash Flow'!B{R[n]}:{E}{R[n]}"
table(wb.create_sheet('Returns'),[('Deal IRR (unlevered equity)',f"=(1+IRR({row('Deal equity cash flow')},0.01))^12-1",P),('Capital partner IRR (after promote)',f"=(1+IRR({row('Capital partner cash flow')},0.01))^12-1",P),
 ('LP net IRR (after promote and carry)',f"=(1+IRR({row('LP cash flow')},0.01))^12-1",P),('GP IRR',f"=(1+IRR({row('GP cash flow')},0.01))^12-1",P),('LP equity multiple',f"=SUMIF({row('LP cash flow')},\">0\")/-SUMIF({row('LP cash flow')},\"<0\")",X),
 ('Developer promote ($)',f"=SUM({row('Promote')})",N),('GP carry ($)',f"=SUM({row('Catch-up to GP')})+SUM({row('Split GP')})",N),('Interest capitalised ($)',f"=SUM({row('Interest capitalised')})",N),('Peak loan ($)',f"=MAX({row('Loan balance')})",N),('Net profit ($)',f"=SUM({row('Deal equity cash flow')})",N)])
wb.save(OUT+'twotier_usd.xlsx')

# ================= 21E availability PPP =================
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='RIVERSIDE SCHOOLS PPP – AVAILABILITY PROJECT FINANCE (GBP)'
I=inputs(ws,[('case','Case (1 Sponsor, 2 Lenders)',1,'0'),('fc','Financial close',datetime.date(2026,6,30),D),('capex','Construction cost (£)',148000000,N),('build','Construction (half-years)',5,'0'),('conc','Concession (half-years from completion)',50,'0'),
 ('up','Unitary payment a year (£)',21500000,N),('rpi','RPI indexation',0.03,P),('opex','Operating cost a year (£)',4200000,N),('dscr','Target DSCR (sculpting)',1.30,X),('rate','Senior all-in rate',0.052,P),('tenor','Debt tenor (half-years)',40,'0'),
 ('dsra','DSRA (half-years of debt service)',1,'0'),('mra','MRA funded ahead (half-years)',3,'0'),('ca','Capital allowances rate (reducing balance)',0.06,P),('tax','Corporation tax',0.25,P),('avail','Unavailability deductions (% of UP) · Sponsor',0.005,P),('availL','Unavailability deductions (% of UP) · Lenders',0.02,P),('opexL','Operating cost uplift · Lenders case',0.1,P)])
lc=wb.create_sheet('Lifecycle');lc.append(['Half-year','Lifecycle cost (£, real)'])
for h in range(1,61):lc.cell(h+1,1,h);lc.cell(h+1,2,(2600000 if h%10==0 else (900000 if h%4==0 else 0)))
cf=wb.create_sheet('Cash Flow');T=55
labs=['Half-year','Date','Construction','Operating','Unitary payment','Deductions','Operating cost','Lifecycle','MRA deposit','MRA release','CFADS','Debt service (sculpted)','Debt balance','Interest','Principal','DSRA balance','DSRA movement','Capital allowances pool','Capital allowances','Taxable profit','Tax','Equity cash flow','DSCR','PV of CFADS remaining','LLCR']
def pfx(t,c,p,R):
    first=t==0;h=f"{c}$3";con=f"AND({h}>=1,{h}<={I['build']})";op=f"AND({h}>{I['build']},{h}<={I['build']}+{I['conc']})";dt=f"AND({h}>{I['build']},{h}<={I['build']}+{I['tenor']})"
    ded=f"IF({I['case']}=1,{I['avail']},{I['availL']})";ox=f"{I['opex']}*IF({I['case']}=1,1,1+{I['opexL']})";idx=f"(1+{I['rpi']})^INT(({h}-{I['build']}-1)/2)"
    D0=f"SUM($B${R['Construction']}:${L(T+2)}${R['Construction']})*0.85"
    pv=lambda k:f"SUMPRODUCT({L(t+3) if t<T else c}{R['CFADS']}:${L(T+2)}${R['CFADS']},1/(1+{I['rate']}/2)^({L(t+3) if t<T else c}$3:${L(T+2)}$3-{h}))"
    return {'Half-year':t,'Date':f"EDATE({I['fc']},6*{h})",'Construction':f"IF({con},{I['capex']}/{I['build']},0)",'Operating':f"IF({op},1,0)",
     'Unitary payment':f"{c}{R['Operating']}*{I['up']}/2*{idx}",'Deductions':f"{c}{R['Unitary payment']}*{ded}",'Operating cost':f"{c}{R['Operating']}*{ox}/2*{idx}",
     'Lifecycle':f"{c}{R['Operating']}*IFERROR(INDEX(Lifecycle!$B$2:$B$61,{h}-{I['build']}),0)*{idx}",
     'MRA deposit':f"{c}{R['Operating']}*SUMPRODUCT((Lifecycle!$A$2:$A$61>{h}-{I['build']})*(Lifecycle!$A$2:$A$61<={h}-{I['build']}+{I['mra']})*Lifecycle!$B$2:$B$61)*{idx}/{I['mra']}",
     'MRA release':f"{c}{R['Lifecycle']}",'CFADS':f"{c}{R['Unitary payment']}-{c}{R['Deductions']}-{c}{R['Operating cost']}-{c}{R['MRA deposit']}",
     'Debt service (sculpted)':f"IF({dt},{c}{R['CFADS']}/{I['dscr']},0)",
     'Debt balance':f"IF({h}<={I['build']},SUM($B${R['Construction']}:{c}{R['Construction']})*0.85,MAX(0,{p}{R['Debt balance']}-{c}{R['Principal']}))" if not first else '0',
     'Interest':'0' if first else f"IF({h}>{I['build']},{p}{R['Debt balance']}*{I['rate']}/2,0)",'Principal':'0' if first else f"IF({dt},MIN({p}{R['Debt balance']},{c}{R['Debt service (sculpted)']}-{c}{R['Interest']}),0)",
     'DSRA balance':f"IF({dt},{L(t+3) if t<T else c}{R['Debt service (sculpted)']}*{I['dsra']},0)",'DSRA movement':f"{c}{R['DSRA balance']}" if first else f"{c}{R['DSRA balance']}-{p}{R['DSRA balance']}",
     'Capital allowances pool':f"IF({h}<={I['build']},SUM($B${R['Construction']}:{c}{R['Construction']}),{p}{R['Capital allowances pool']}-{c}{R['Capital allowances']})" if not first else '0',
     'Capital allowances':'0' if first else f"IF({h}>{I['build']},{p}{R['Capital allowances pool']}*{I['ca']}/2,0)",
     'Taxable profit':f"{c}{R['CFADS']}-{c}{R['Interest']}-{c}{R['Capital allowances']}",'Tax':f"MAX(0,{c}{R['Taxable profit']})*{I['tax']}",
     'Equity cash flow':f"-{c}{R['Construction']}*0.15" if first else f"IF({con},-{c}{R['Construction']}*0.15,{c}{R['CFADS']}-{c}{R['Debt service (sculpted)']}-{c}{R['DSRA movement']}-{c}{R['Tax']}+IF({h}={I['build']}+{I['conc']},SUM($B${R['MRA deposit']}:{c}{R['MRA deposit']})-SUM($B${R['MRA release']}:{c}{R['MRA release']}),0))",
     'DSCR':f"IF({c}{R['Debt service (sculpted)']}>0,{c}{R['CFADS']}/{c}{R['Debt service (sculpted)']},0)",
     'PV of CFADS remaining':'0' if first else f"IF({dt},SUMPRODUCT(({L(t+2)}$3:${L(T+2)}$3>{h}-1)*({L(t+2)}$3:${L(T+2)}$3<={I['build']}+{I['tenor']})*{L(t+2)}${R['CFADS']}:${L(T+2)}${R['CFADS']}/(1+{I['rate']}/2)^({L(t+2)}$3:${L(T+2)}$3-{h}+1)),0)",
     'LLCR':f"IF(AND({dt},{p}{R['Debt balance']}>0),{c}{R['PV of CFADS remaining']}/{p}{R['Debt balance']},0)" if not first else '0'}
R=timeline(cf,labs,T,pfx);E=L(T+2);row=lambda n:f"'Cash Flow'!B{R[n]}:{E}{R[n]}";rowc=lambda n:f"'Cash Flow'!C{R[n]}:{E}{R[n]}"
for t in range(T+1):cf[f'{L(t+2)}{R["Date"]}'].number_format=D
table(wb.create_sheet('Returns'),[('Equity IRR (XIRR)',f"=XIRR({row('Equity cash flow')},{row('Date')})",P),('Minimum DSCR',f"=_xlfn.MINIFS({rowc('DSCR')},{rowc('DSCR')},\">0\")",X),('Minimum LLCR',f"=_xlfn.MINIFS({rowc('LLCR')},{rowc('LLCR')},\">0\")",X),
 ('Senior debt at completion (£)',f"=MAX({row('Debt balance')})",N),('Gearing',f"=B6/{I['capex']}",P),('Tax paid (£)',f"=SUM({row('Tax')})",N),('Lifecycle spend (£)',f"=SUM({row('Lifecycle')})",N),('Net profit to equity (£)',f"=SUM({row('Equity cash flow')})",N),
 ('Case in use',f"=IF({I['case']}=1,\"Sponsor\",\"Lenders\")",'@')])
wb.save(OUT+'ppp_gbp.xlsx')
print('ok')

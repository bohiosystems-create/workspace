# round 14: five more model types
#  mob    - medical office building, USD, rent roll by tenant type with SUMIFS (Hospital / Physician / Retail), renewal by type
#  season - resort hotel, EUR, monthly seasonality table (ADR and occupancy for Jan..Dec in one row each)
#  loans  - debt fund loan book, USD, six loans (fixed / floating), WAC, weighted LTV, expected loss, SOFR on floating only
#  tokyo  - Tokyo rental apartments, JPY, unit mix with XLOOKUP into a rent table
#  plots  - Indian plotted development, INR in crore (1 crore = 10 million), sales in tranches
import openpyxl,os
from openpyxl.utils import get_column_letter as L
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m14/';os.makedirs(OUT+'calc',exist_ok=True)
P='0.00%';N='#,##0';N2='#,##0.00'
def inputs(ws,rows,col=2,start=3):
    I={};r=start
    for k,lab,v,f in rows:
        ws.cell(r,1,lab);c=ws.cell(r,col,v);c.number_format=f
        I[k]=(f"'{ws.title}'" if ' ' in ws.title else ws.title)+f"!${L(col)}${r}";r+=1
    return I
def summary(wb,name,rows):
    s=wb.create_sheet(name)
    for i,(lab,f,fm) in enumerate(rows):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm

# ---------- medical office, USD ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='CEDAR PARK MEDICAL OFFICE BUILDING – ACQUISITION (USD)'
I=inputs(ws,[('price','Purchase price',50000000,N),('closing','Closing costs',0.015,P),('exit','Exit cap rate',0.065,P),('hold','Hold (years)',7,'0'),('growth','Rent escalator',0.025,P),
  ('opex','Non-recoverable opex ($/sf)',3.25,N2),('ti','TI on renewal ($/sf)',45,N),('ltv','LTV',0.55,P),('rate','Loan rate',0.0625,P)])
rr=wb.create_sheet('Rent Roll');rr.append(['Tenant','Type','SF','Rent ($/sf NNN)','Expiry (year)','Renewal probability'])
T=[('Mercy Health','Hospital',38000,34,4,0.9),('Cedar Ortho','Physician',12000,31,3,0.7),('Lakeside Imaging','Physician',9000,33,5,0.75),('Kids Dental','Physician',5000,30,2,0.6),('CVS','Retail',11000,28,6,0.8),('Mercy Labs','Hospital',15000,35,6,0.9)]
for t in T:rr.append(list(t))
ty=wb.create_sheet('By Type');ty.append(['Type','SF','Annual rent','Weighted renewal'])
for i,tp in enumerate(['Hospital','Physician','Retail'],start=2):
    ty.cell(i,1,tp);ty.cell(i,2,f"=SUMIFS('Rent Roll'!$C$2:$C$7,'Rent Roll'!$B$2:$B$7,A{i})");ty.cell(i,3,f"=SUMPRODUCT(('Rent Roll'!$B$2:$B$7=A{i})*'Rent Roll'!$C$2:$C$7*'Rent Roll'!$D$2:$D$7)")
    ty.cell(i,4,f"=IFERROR(SUMPRODUCT(('Rent Roll'!$B$2:$B$7=A{i})*'Rent Roll'!$C$2:$C$7*'Rent Roll'!$F$2:$F$7)/B{i},0)")
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';cf['A4']='Rent';cf['A5']='Expected downtime loss';cf['A6']='Opex';cf['A7']='TI';cf['A8']='Sale';cf['A9']='Purchase';cf['A10']='Unlevered cash flow';cf['A11']='Debt';cf['A12']='Levered cash flow'
for y in range(0,9):
    c=L(y+2);cf[f'{c}3']=y;on=f"({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}4']=f"={on}*SUMPRODUCT('Rent Roll'!$C$2:$C$7,'Rent Roll'!$D$2:$D$7)*(1+{I['growth']})^MAX(0,{c}$3-1)"
    cf[f'{c}5']=f"=-{on}*SUMPRODUCT(('Rent Roll'!$E$2:$E$7={c}$3)*'Rent Roll'!$C$2:$C$7*'Rent Roll'!$D$2:$D$7*(1-'Rent Roll'!$F$2:$F$7))"
    cf[f'{c}6']=f"=-{on}*SUM('Rent Roll'!$C$2:$C$7)*{I['opex']}"
    cf[f'{c}7']=f"=-{on}*SUMPRODUCT(('Rent Roll'!$E$2:$E$7={c}$3)*'Rent Roll'!$C$2:$C$7*'Rent Roll'!$F$2:$F$7)*{I['ti']}"
    cf[f'{c}8']=f"=IF({c}$3={I['hold']},SUMPRODUCT('Rent Roll'!$C$2:$C$7,'Rent Roll'!$D$2:$D$7)*(1+{I['growth']})^{c}$3/{I['exit']},0)"
    cf[f'{c}9']=f"=IF({c}$3=0,-{I['price']}*(1+{I['closing']}),0)"
    cf[f'{c}10']=f"=SUM({c}4:{c}9)"
    cf[f'{c}11']=f"=IF({c}$3=0,{I['price']}*{I['ltv']},0)-{on}*{I['price']}*{I['ltv']}*{I['rate']}-IF({c}$3={I['hold']},{I['price']}*{I['ltv']},0)"
    cf[f'{c}12']=f"={c}10+{c}11"
summary(wb,'Returns',[('Unlevered IRR',"=IRR('Cash Flow'!B10:J10)",P),('Levered IRR',"=IRR('Cash Flow'!B12:J12)",P),('Equity multiple',"=SUMIF('Cash Flow'!B12:J12,\">0\")/-SUMIF('Cash Flow'!B12:J12,\"<0\")",'0.00"x"'),
  ('Going-in cap rate',f"=(SUMPRODUCT('Rent Roll'!C2:C7,'Rent Roll'!D2:D7)-SUM('Rent Roll'!C2:C7)*{I['opex']})/{I['price']}",P),('Net profit',"=SUM('Cash Flow'!B10:J10)",N),('Hospital share of rent',"='By Type'!C2/SUM('By Type'!C2:C4)",P)])
wb.save(OUT+'mob_usd.xlsx')

# ---------- resort hotel with monthly seasonality, EUR ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Assumptions';ws['A1']='COSTA AZUL RESORT – SEASONAL OPERATING MODEL (EUR)'
I=inputs(ws,[('keys','Keys',240,N),('fb','F&B revenue (% of rooms)',0.45,P),('gop','GOP margin',0.36,P),('ffe','FF&E reserve',0.04,P),('price','Purchase price',72000000,N),('exit','Exit cap rate',0.075,P),('hold','Hold (years)',5,'0'),('growth','RevPAR growth',0.03,P)])
se=wb.create_sheet('Seasonality');months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];days=[31,28,31,30,31,30,31,31,30,31,30,31]
se.cell(1,1,'Month');[se.cell(1,2+i,m) for i,m in enumerate(months)]
se.cell(2,1,'Days');[se.cell(2,2+i,d) for i,d in enumerate(days)]
se.cell(3,1,'ADR (EUR)');[se.cell(3,2+i,v) for i,v in enumerate([120,125,140,165,190,245,290,300,220,170,130,135])]
se.cell(4,1,'Occupancy');[se.cell(4,2+i,v) for i,v in enumerate([0.42,0.48,0.58,0.68,0.76,0.88,0.94,0.95,0.84,0.7,0.5,0.47])]
for i in range(12):se.cell(4,2+i).number_format=P
se.cell(5,1,'Rooms revenue');[se.cell(5,2+i,f"={L(2+i)}3*{L(2+i)}4*{L(2+i)}2*{I['keys']}") for i in range(12)]
se['A7']='Annual rooms revenue';se['B7']='=SUM(B5:M5)';se['A8']='Annual RevPAR';se['B8']=f"=B7/({I['keys']}*365)"
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';cf['A4']='Total revenue';cf['A5']='EBITDA';cf['A6']='Sale';cf['A7']='Purchase';cf['A8']='Net cash flow'
for y in range(0,7):
    c=L(y+2);cf[f'{c}3']=y;on=f"({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}4']=f"={on}*Seasonality!$B$7*(1+{I['fb']})*(1+{I['growth']})^MAX(0,{c}$3-1)"
    cf[f'{c}5']=f"={c}4*({I['gop']}-{I['ffe']})"
    cf[f'{c}6']=f"=IF({c}$3={I['hold']},{c}5*(1+{I['growth']})/{I['exit']},0)"
    cf[f'{c}7']=f"=IF({c}$3=0,-{I['price']},0)";cf[f'{c}8']=f"=SUM({c}5:{c}7)"
summary(wb,'Returns',[('Unlevered IRR',"=IRR('Cash Flow'!B8:H8)",P),('Net profit',"=SUM('Cash Flow'!B8:H8)",N),('Year 1 EBITDA',"='Cash Flow'!C5",N),('Annual RevPAR (EUR)','=Seasonality!B8',N2),('Price per key',f"={I['price']}/{I['keys']}",N),('Going-in yield',f"='Cash Flow'!C5/{I['price']}",P)])
wb.save(OUT+'season_eur.xlsx')

# ---------- debt fund loan book, USD ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Fund';ws['A1']='MERIDIAN CREDIT FUND II – LOAN BOOK (USD)'
I=inputs(ws,[('sofr','SOFR',0.043,P),('fee','Management fee',0.0125,P),('lev','Fund leverage (x equity)',0.5,'0.00"x"'),('cof','Cost of fund leverage',0.065,P),('lgd','Loss given default',0.35,P)])
lb=wb.create_sheet('Loans');lb.append(['Loan','Balance','Rate type','Fixed rate / spread','LTV','Default probability'])
LO=[('Loan 1 – Austin multifamily',42000000,'Floating',0.035,0.68,0.02),('Loan 2 – Denver office',28000000,'Floating',0.045,0.72,0.06),('Loan 3 – Miami hotel',35000000,'Fixed',0.085,0.65,0.04),
    ('Loan 4 – Phoenix industrial',22000000,'Fixed',0.072,0.6,0.01),('Loan 5 – Chicago life science',30000000,'Floating',0.04,0.7,0.03),('Loan 6 – Nashville student',18000000,'Fixed',0.078,0.66,0.02)]
for l in LO:lb.append(list(l))
for r in range(2,8):lb.cell(r,4).number_format=P;lb.cell(r,5).number_format=P;lb.cell(r,6).number_format=P
lb.cell(1,7,'All-in coupon');lb.cell(1,8,'Expected loss')
for r in range(2,8):
    lb.cell(r,7,f"=IF(C{r}=\"Floating\",{I['sofr']}+D{r},D{r})").number_format=P;lb.cell(r,8,f"=B{r}*F{r}*{I['lgd']}").number_format=N
summary(wb,'Summary',[('Loan book',"=SUM(Loans!B2:B7)",N),('Weighted average coupon',"=SUMPRODUCT(Loans!B2:B7,Loans!G2:G7)/B3",P),('Weighted average LTV',"=SUMPRODUCT(Loans!B2:B7,Loans!E2:E7)/B3",P),
  ('Expected loss (annual)',"=SUM(Loans!H2:H7)",N),('Fund equity',f"=B3/(1+{I['lev']})",N),('Net income',f"=B3*B4-B6-(B3-B7)*{I['cof']}-B7*{I['fee']}",N),('Net return on equity','=B8/B7',P),('Net profit','=B8',N)])
wb.save(OUT+'loans_usd.xlsx')

# ---------- Tokyo apartments, JPY, XLOOKUP ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='SHIBUYA RESIDENCE – RENTAL APARTMENTS (JPY)'
I=inputs(ws,[('price','Purchase price (¥)',2300000000,N),('occ','Occupancy',0.96,P),('opex','Opex (% of rent)',0.22,P),('exit','Exit cap rate',0.0375,P),('hold','Hold (years)',5,'0'),('growth','Rent growth',0.015,P),('ltv','LTV',0.6,P),('rate','Loan rate',0.012,P)])
rt=wb.create_sheet('Rent Table');rt.append(['Type','Monthly rent (¥)']);[rt.append(list(r)) for r in [('1K',98000),('1LDK',165000),('2LDK',245000)]]
mx=wb.create_sheet('Unit Mix');mx.append(['Type','Units','Monthly rent (¥)'])
for i,(t,u) in enumerate([('1K',40),('1LDK',24),('2LDK',8)],start=2):mx.cell(i,1,t);mx.cell(i,2,u);mx.cell(i,3,f"=INDEX('Rent Table'!$B$2:$B$4,MATCH(A{i},'Rent Table'!$A$2:$A$4,0))")
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';cf['A4']='NOI';cf['A5']='Sale';cf['A6']='Purchase';cf['A7']='Unlevered';cf['A8']='Debt';cf['A9']='Levered'
for y in range(0,7):
    c=L(y+2);cf[f'{c}3']=y;on=f"({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}4']=f"={on}*SUMPRODUCT('Unit Mix'!$B$2:$B$4,'Unit Mix'!$C$2:$C$4)*12*{I['occ']}*(1-{I['opex']})*(1+{I['growth']})^MAX(0,{c}$3-1)"
    cf[f'{c}5']=f"=IF({c}$3={I['hold']},{c}4*(1+{I['growth']})/{I['exit']},0)";cf[f'{c}6']=f"=IF({c}$3=0,-{I['price']},0)";cf[f'{c}7']=f"=SUM({c}4:{c}6)"
    cf[f'{c}8']=f"=IF({c}$3=0,{I['price']}*{I['ltv']},0)-{on}*{I['price']}*{I['ltv']}*{I['rate']}-IF({c}$3={I['hold']},{I['price']}*{I['ltv']},0)";cf[f'{c}9']=f"={c}7+{c}8"
summary(wb,'Returns',[('Unlevered IRR',"=IRR('Cash Flow'!B7:H7)",P),('Levered IRR',"=IRR('Cash Flow'!B9:H9)",P),('Net profit',"=SUM('Cash Flow'!B7:H7)",N),('Going-in NOI yield',f"='Cash Flow'!C4/{I['price']}",P),('Equity multiple',"=SUMIF('Cash Flow'!B9:H9,\">0\")/-SUMIF('Cash Flow'!B9:H9,\"<0\")",'0.00"x"')])
wb.save(OUT+'tokyo_jpy.xlsx')

# ---------- Indian plotted development, INR crore ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='SARJAPUR GREENS – PLOTTED DEVELOPMENT (₹ crore)'
I=inputs(ws,[('land','Land cost (₹ crore)',190,N2),('acres','Site (acres)',32,N2),('eff','Saleable plot area (%)',0.55,P),('rate','Plot rate (₹ per sq ft)',4300,N),('infra','Infrastructure cost (₹ per sq ft of plots)',650,N),
  ('approvals','Approvals & fees (₹ crore)',6.5,N2),('mkt','Marketing (% of sales)',0.03,P),('t1','Tranche 1 sold (%)',0.4,P),('t2','Tranche 2 sold (%)',0.35,P),('esc','Rate escalation per tranche',0.06,P)])
s=wb.create_sheet('Appraisal');rows=[('Saleable area (sq ft)',f"={I['acres']}*43560*{I['eff']}",N),('Tranche 3 sold (%)',f"=1-{I['t1']}-{I['t2']}",P),
 ('Sales tranche 1 (₹ crore)',f"=B3*{I['t1']}*{I['rate']}/1E7",N2),('Sales tranche 2 (₹ crore)',f"=B3*{I['t2']}*{I['rate']}*(1+{I['esc']})/1E7",N2),('Sales tranche 3 (₹ crore)',f"=B3*B4*{I['rate']}*(1+{I['esc']})^2/1E7",N2),
 ('Gross sales (₹ crore)','=SUM(B5:B7)',N2),('Infrastructure (₹ crore)',f"=B3*{I['infra']}/1E7",N2),('Marketing (₹ crore)',f"=B8*{I['mkt']}",N2),('Total cost (₹ crore)',f"={I['land']}+{I['approvals']}+B9+B10",N2),
 ('Net profit (₹ crore)','=B8-B11',N2),('Profit on cost','=B12/B11',P),('Project IRR (3-year)',"=IRR(Timeline!B6:E6)",P)]
for i,(lab,f,fm) in enumerate(rows):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
tl=wb.create_sheet('Timeline');tl['A3']='Year';tl['A4']='Inflows';tl['A5']='Outflows';tl['A6']='Net'
for y in range(0,4):
    c=L(y+2);tl[f'{c}3']=y
    tl[f'{c}4']=['=0','=Appraisal!B5','=Appraisal!B6','=Appraisal!B7'][y]
    tl[f'{c}5']=[f"=-{I['land']}-{I['approvals']}",'=-Appraisal!B9*0.6-Appraisal!B5*'+I['mkt'],'=-Appraisal!B9*0.4-Appraisal!B6*'+I['mkt'],'=-Appraisal!B7*'+I['mkt']][y]
    tl[f'{c}6']=f"={c}4+{c}5"
wb.save(OUT+'plots_inr.xlsx')
print('ok')

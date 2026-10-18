# The demo model: a Riyadh mixed-use development and hold, built the way a top modelling team would build it.
# Monthly over 8 years; residential sold off-plan on a payment plan with escrow; retail and offices leased; a hotel; a Murabaha
# construction facility with covenants; RETT, VAT and zakat; a JV waterfall; scenarios; an annual summary; a sensitivity grid; checks.
# Every figure is a live formula from the Inputs sheet (no hard-coded results). Synthetic: no client data.
import openpyxl,os,datetime
from openpyxl.utils import get_column_letter as L
from openpyxl.styles import Font,PatternFill,Alignment,Border,Side
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/demo/'
os.makedirs(OUT,exist_ok=True)
NAVY='1F2A44';TEAL='0E7C7B';GOLD='C9A227';GREY='F2F4F7';INPUT_BG='FFF7D6';BLUE='1F4FD8'
P='0.0%';P2='0.00%';N='#,##0;(#,##0);"–"';NM='#,##0.0,,"m";(#,##0.0,,"m");"–"';X='0.00"x"';D='mmm-yy';D2='dd-mmm-yyyy'
thin=Side(style='thin',color='D0D5DD');B=Border(bottom=thin)
H1=Font(name='Calibri',size=18,bold=True,color='FFFFFF');H2=Font(name='Calibri',size=12,bold=True,color=NAVY);HB=Font(name='Calibri',bold=True,color='FFFFFF')
FILL=lambda c:PatternFill('solid',fgColor=c)
wb=openpyxl.Workbook()

def banner(ws,title,sub,width=12):
    ws.sheet_view.showGridLines=False
    for c in range(1,width+1):ws.cell(1,c).fill=FILL(NAVY);ws.cell(2,c).fill=FILL(NAVY)
    ws['A1']=title;ws['A1'].font=H1;ws['A2']=sub;ws['A2'].font=Font(name='Calibri',color='C8D1E0',italic=True)
    ws.row_dimensions[1].height=28
def section(ws,r,text,width=12):
    for c in range(1,width+1):ws.cell(r,c).fill=FILL(GREY)
    ws.cell(r,1,text).font=H2

# ---------------------------------------------------------------- Cover
cv=wb.active;cv.title='Cover';banner(cv,'AL NAKHEEL GATE – MIXED-USE DEVELOPMENT, RIYADH (SAR)','Development and hold model · monthly, 96 months · synthetic demo data',10)
rows=[('Purpose','Investment committee model for a mixed-use scheme: residential for sale, retail and office for lease, a 220-key hotel.'),
 ('Currency and units','SAR. Monthly cash flows on the Cash Flow sheet; annual summary on Annual; headline results on Dashboard.'),
 ('How to use','Change only the yellow cells on Inputs (blue figures). Pick the case on Inputs!C5. Every other figure is a formula.'),
 ('Sheets','Inputs · Cash Flow · Annual · Financing · Waterfall · Sensitivity · Checks · Dashboard'),
 ('Checks','All checks on the Checks sheet must read OK; the overall flag is on the Dashboard.'),
 ('Status','Synthetic demo model: no client data.')]
for i,(k,v) in enumerate(rows,4):cv.cell(i,1,k).font=Font(name='Calibri',bold=True,color=NAVY);cv.cell(i,2,v);cv.cell(i,2).alignment=Alignment(wrap_text=True,vertical='top')
cv.column_dimensions['A'].width=20;cv.column_dimensions['B'].width=110

# ---------------------------------------------------------------- Inputs
ins=wb.create_sheet('Inputs');banner(ins,'INPUTS','Yellow cells are inputs; the live case is chosen in C5',8)
for col,w in zip('ABCDEFGH',[46,14,14,14,14,4,40,10]):ins.column_dimensions[col].width=w
ins['A4']='Case';ins['A4'].font=Font(name='Calibri',bold=True)
ins['A5']='Case running (1 = Base, 2 = Upside, 3 = Downside)';ins['C5']=1;ins['C5'].font=Font(name='Calibri',bold=True,color=BLUE);ins['C5'].fill=FILL(INPUT_BG)
dv=DataValidation(type='whole',operator='between',formula1='1',formula2='3',showErrorMessage=True,error='1, 2 or 3');ins.add_data_validation(dv);dv.add('C5')
ins['D5']='=CHOOSE(C5,"Base","Upside","Downside")';ins['D5'].font=Font(name='Calibri',bold=True,color=TEAL)
for j,h in enumerate(['Live','Base','Upside','Downside'],2):c=ins.cell(7,j,h);c.font=HB;c.fill=FILL(TEAL);c.alignment=Alignment(horizontal='center')
ins.cell(7,1,'Assumption').font=HB;ins.cell(7,1).fill=FILL(TEAL);ins.cell(7,7,'Note').font=HB;ins.cell(7,7).fill=FILL(TEAL)
NAMES={}
def inp(r,name,label,base,up,down,fmt,note=''):
    ins.cell(r,1,label);ins.cell(r,7,note).font=Font(name='Calibri',italic=True,color='667085')
    for j,v in enumerate([base,up,down],3):c=ins.cell(r,j,v);c.number_format=fmt;c.font=Font(name='Calibri',color=BLUE);c.fill=FILL(INPUT_BG)
    c=ins.cell(r,2,f'=CHOOSE($C$5,C{r},D{r},E{r})');c.number_format=fmt;c.font=Font(name='Calibri',bold=True)
    wb.defined_names[name]=DefinedName(name,attr_text=f'Inputs!$B${r}');NAMES[name]=f'Inputs!$B${r}'
r=8
def S(t):
    global r;r+=1;section(ins,r,t,7);r+=1
S('Timing')
inp(r,'StartDate','Model start (month 0)',datetime.date(2026,12,31),datetime.date(2026,12,31),datetime.date(2026,12,31),D2);r+=1
inp(r,'BuildMonths','Construction period (months)',30,28,36,'0');r+=1
inp(r,'HoldMonths','Hold after completion before the exit (months)',42,42,42,'0','Exit at month construction + hold');r+=1
S('Land and construction')
inp(r,'Land','Land price (SAR)',650000000,650000000,650000000,N);r+=1
inp(r,'RETT','Real estate transaction tax on land',0.05,0.05,0.05,P2);r+=1
inp(r,'GFA','Gross floor area (sqm)',186000,186000,186000,N);r+=1
inp(r,'BuildRate','Construction cost (SAR per sqm GFA)',6200,6000,6800,N);r+=1
inp(r,'SoftCosts','Professional fees and soft costs (share of construction)',0.11,0.1,0.12,P);r+=1
inp(r,'Contingency','Contingency (share of construction)',0.06,0.05,0.08,P);r+=1
S('Residential for sale (off-plan)')
inp(r,'ResUnits','Apartments',540,540,540,N);r+=1
inp(r,'ResPrice','Average price per apartment (SAR)',1750000,1850000,1600000,N);r+=1
inp(r,'ResSalesStart','Sales launch (month)',3,3,6,'0');r+=1
inp(r,'ResSalesMonths','Months to sell out',30,24,40,'0');r+=1
inp(r,'ResDeposit','Deposit at signing',0.1,0.1,0.1,P);r+=1
inp(r,'ResEscrowRel','Escrow released to the developer, share of construction progress',1.0,1.0,0.9,P,'Wafi: collections released as the build progresses');r+=1
inp(r,'SalesComm','Sales commission and marketing',0.025,0.025,0.03,P);r+=1
S('Retail and offices (leased and held)')
inp(r,'RetailGLA','Retail leasable area (sqm)',32000,32000,32000,N);r+=1
inp(r,'RetailRent','Retail rent (SAR per sqm a year)',1850,1950,1650,N);r+=1
inp(r,'OfficeGLA','Office leasable area (sqm)',41000,41000,41000,N);r+=1
inp(r,'OfficeRent','Office rent (SAR per sqm a year)',1350,1450,1200,N);r+=1
inp(r,'LeaseUp','Lease-up after completion (months to stabilise)',18,12,24,'0');r+=1
inp(r,'StabOcc','Stabilised occupancy',0.92,0.95,0.85,P);r+=1
inp(r,'RentFree','Rent-free on first leases (months)',4,3,6,'0');r+=1
inp(r,'RentGrowth','Rent growth a year',0.03,0.035,0.015,P);r+=1
inp(r,'Opex','Non-recoverable costs (share of rent)',0.12,0.11,0.14,P);r+=1
S('Hotel (220 keys)')
inp(r,'Keys','Keys',220,220,220,N);r+=1
inp(r,'ADR','Average daily rate, opening year (SAR)',780,820,700,N);r+=1
inp(r,'HotelOcc','Stabilised occupancy',0.72,0.76,0.64,P);r+=1
inp(r,'HotelRamp','Ramp-up (months to stabilise)',24,18,30,'0');r+=1
inp(r,'GOPMargin','GOP margin (after operator fees)',0.34,0.36,0.30,P);r+=1
inp(r,'FFE','FF&E reserve (share of revenue)',0.04,0.04,0.04,P);r+=1
S('Exit')
inp(r,'ExitYield','Exit yield on retail and offices',0.0725,0.07,0.08,P2);r+=1
inp(r,'HotelMult','Hotel exit multiple on EBITDA',11.0,12.0,9.5,'0.0"x"');r+=1
inp(r,'ExitCosts','Disposal costs',0.015,0.015,0.02,P);r+=1
S('Financing (Murabaha)')
inp(r,'LTC','Facility as share of development cost',0.45,0.45,0.4,P);r+=1
inp(r,'SAIBOR','SAIBOR',0.0545,0.05,0.06,P2);r+=1
inp(r,'Margin','Margin (bps)',275,250,325,'0');r+=1
inp(r,'UpfrontFee','Upfront fee',0.0075,0.0075,0.01,P2);r+=1
inp(r,'Amort','Amortisation after completion (share of facility a year)',0.03,0.03,0.03,P);r+=1
inp(r,'MinDSCR','DSCR covenant (minimum)',1.25,1.25,1.25,X);r+=1
inp(r,'MaxLTV','LTV covenant (maximum)',0.6,0.6,0.6,P);r+=1
S('Tax')
inp(r,'VAT','VAT on residential sales (first home: zero)',0.0,0.0,0.0,P);r+=1
inp(r,'Zakat','Zakat on the zakat base',0.025,0.025,0.025,P2);r+=1
S('Joint venture')
inp(r,'GPShare','Developer (GP) share of equity',0.1,0.1,0.1,P);r+=1
inp(r,'Pref','Preferred return to all equity',0.1,0.1,0.1,P);r+=1
inp(r,'CatchUp','GP catch-up (share of distributions until caught up)',0.5,0.5,0.5,P);r+=1
inp(r,'Promote','GP promote above the catch-up',0.25,0.25,0.25,P);r+=1
inp(r,'DiscRate','Discount rate for NPV',0.1,0.1,0.1,P);r+=1
ins.freeze_panes='B8'

# ---------------------------------------------------------------- Cash Flow (monthly)
cf=wb.create_sheet('Cash Flow');T=96;FC=3   # columns C.. for months 0..96
banner(cf,'CASH FLOW – MONTHLY (SAR)','Months 0–96 across; every row is a formula; totals in column B',min(T+FC,40))
cf.column_dimensions['A'].width=44;cf.column_dimensions['B'].width=16
for t in range(T+1):cf.column_dimensions[L(t+FC)].width=12
rows=[]
def H(txt):rows.append(('H',txt))
def Rw(key,label,fn,fmt=N,total=True,bold=False):rows.append(('R',key,label,fn,fmt,total,bold))
H('Timeline')
Rw('m','Month',lambda t,c,p:t,'0',False)
Rw('date','Month end',lambda t,c,p:f'=EOMONTH(StartDate,{c}$5)',D,False)
Rw('year','Year',lambda t,c,p:f'=YEAR({c}{{date}})','0',False)
Rw('build','Construction flag',lambda t,c,p:f'=IF(AND({c}$5>=1,{c}$5<=BuildMonths),1,0)','0',False)
Rw('ops','Operating flag',lambda t,c,p:f'=IF(AND({c}$5>BuildMonths,{c}$5<=BuildMonths+HoldMonths),1,0)','0',False)
Rw('exit','Exit flag',lambda t,c,p:f'=IF({c}$5=BuildMonths+HoldMonths,1,0)','0',False)
Rw('scurve','Construction S-curve (share this month)',lambda t,c,p:f'=IF({c}{{build}}=1,(1-COS(PI()*{c}$5/BuildMonths))/2-(1-COS(PI()*({c}$5-1)/BuildMonths))/2,0)','0.00%')
Rw('prog','Construction progress (cumulative)',lambda t,c,p:f'=SUM($C{{scurve}}:{c}{{scurve}})','0.0%',False)
H('Development cost')
Rw('land','Land',lambda t,c,p:f'=IF({c}$5=0,Land,0)')
Rw('rett','RETT on land',lambda t,c,p:f'={c}{{land}}*RETT')
Rw('hard','Construction',lambda t,c,p:f'=GFA*BuildRate*{c}{{scurve}}')
Rw('soft','Soft costs',lambda t,c,p:f'={c}{{hard}}*SoftCosts')
Rw('cont','Contingency',lambda t,c,p:f'={c}{{hard}}*Contingency')
Rw('devcost','Development cost before finance',lambda t,c,p:f'=SUM({c}{{land}}:{c}{{cont}})',N,True,True)
H('Residential sales (off-plan)')
Rw('sold','Apartments sold',lambda t,c,p:f'=IF(AND({c}$5>=ResSalesStart,{c}$5<ResSalesStart+ResSalesMonths),ResUnits/ResSalesMonths,0)','0.0')
Rw('contracts','Contract value signed',lambda t,c,p:f'={c}{{sold}}*ResPrice')
Rw('owedpre','Balance owed by buyers before this month\'s payments',lambda t,c,p:(f'={c}{{contracts}}*(1-ResDeposit)' if t==0 else f'={p}{{owed}}+{c}{{contracts}}*(1-ResDeposit)'),N,False)
Rw('paid','Instalments paid (with construction progress; in full after completion)',lambda t,c,p:f'=IF({c}$5<=BuildMonths,{c}{{owedpre}}*{c}{{scurve}}/MAX(0.000001,1-{c}{{prog}}+{c}{{scurve}}),{c}{{owedpre}})')
Rw('owed','Balance owed by buyers',lambda t,c,p:f'={c}{{owedpre}}-{c}{{paid}}',N,False)
Rw('collect','Buyer payments into escrow',lambda t,c,p:f'={c}{{contracts}}*ResDeposit+{c}{{paid}}')
Rw('relcum','Escrow the developer may draw (cumulative)',lambda t,c,p:f'=IF({c}$5<BuildMonths,SUM($C{{collect}}:{c}{{collect}})*{c}{{prog}}*ResEscrowRel,SUM($C{{collect}}:{c}{{collect}}))',N,False)
Rw('escrow','Escrow released to the developer',lambda t,c,p:(f'={c}{{relcum}}' if t==0 else f'=MAX(0,{c}{{relcum}}-SUM($C{{escrow}}:{p}{{escrow}}))'))
Rw('comm','Sales commission and marketing',lambda t,c,p:f'={c}{{contracts}}*SalesComm')
Rw('vat','VAT on sales',lambda t,c,p:f'={c}{{escrow}}*VAT')
H('Retail and offices')
Rw('occ','Occupancy',lambda t,c,p:f'=IF({c}{{ops}}=1,StabOcc*MIN(1,({c}$5-BuildMonths)/LeaseUp),0)','0.0%',False)
Rw('idx','Rent index',lambda t,c,p:f'=(1+RentGrowth)^(MAX(0,{c}$5-1)/12)','0.000',False)
Rw('rfree','Rent-free factor',lambda t,c,p:f'=IF(AND({c}{{ops}}=1,{c}$5<=BuildMonths+RentFree),0,1)','0',False)
Rw('retail','Retail rent',lambda t,c,p:f'=RetailGLA*RetailRent/12*{c}{{occ}}*{c}{{idx}}*{c}{{rfree}}')
Rw('office','Office rent',lambda t,c,p:f'=OfficeGLA*OfficeRent/12*{c}{{occ}}*{c}{{idx}}*{c}{{rfree}}')
Rw('opex','Non-recoverable costs',lambda t,c,p:f'=({c}{{retail}}+{c}{{office}})*Opex')
Rw('noi','Net operating income, retail and offices',lambda t,c,p:f'={c}{{retail}}+{c}{{office}}-{c}{{opex}}',N,True,True)
H('Hotel')
Rw('hocc','Hotel occupancy',lambda t,c,p:f'=IF({c}{{ops}}=1,HotelOcc*MIN(1,0.55+0.45*({c}$5-BuildMonths)/HotelRamp),0)','0.0%',False)
Rw('hrev','Hotel revenue',lambda t,c,p:f'=Keys*DAY({c}{{date}})*{c}{{hocc}}*ADR*{c}{{idx}}/0.62')
Rw('hgop','Hotel GOP after operator fees',lambda t,c,p:f'={c}{{hrev}}*GOPMargin')
Rw('hffe','FF&E reserve',lambda t,c,p:f'={c}{{hrev}}*FFE')
Rw('hebitda','Hotel EBITDA',lambda t,c,p:f'={c}{{hgop}}-{c}{{hffe}}',N,True,True)
H('Exit')
Rw('exitv','Exit value, retail and offices',lambda t,c,p:f'=IF({c}{{exit}}=1,SUM({L(max(FC,t+FC-11))}{{noi}}:{c}{{noi}})*(1+RentGrowth)/ExitYield,0)')
Rw('exith','Exit value, hotel',lambda t,c,p:f'=IF({c}{{exit}}=1,SUM({L(max(FC,t+FC-11))}{{hebitda}}:{c}{{hebitda}})*HotelMult,0)')
Rw('exitc','Disposal costs',lambda t,c,p:f'=({c}{{exitv}}+{c}{{exith}})*ExitCosts')
H('Project cash flow')
Rw('inflow','Cash in',lambda t,c,p:f'={c}{{escrow}}+{c}{{noi}}+{c}{{hebitda}}+{c}{{exitv}}+{c}{{exith}}-{c}{{exitc}}')
Rw('outflow','Cash out',lambda t,c,p:f'={c}{{devcost}}+{c}{{comm}}+{c}{{vat}}')
Rw('zakat','Zakat',lambda t,c,p:f'=IF(AND(MONTH({c}{{date}})=12,{c}$5>0),MAX(0,SUM({L(max(FC,t+FC-11))}{{inflow}}:{c}{{inflow}})-SUM({L(max(FC,t+FC-11))}{{outflow}}:{c}{{outflow}}))*Zakat,0)')
Rw('ucf','Unlevered cash flow',lambda t,c,p:f'={c}{{inflow}}-{c}{{outflow}}-{c}{{zakat}}',N,True,True)
H('Financing (from the Financing sheet)')
Rw('draw','Facility drawn',lambda t,c,p:f"=Financing!{c}{{f_draw}}")
Rw('fin','Profit and fees paid',lambda t,c,p:f"=Financing!{c}{{f_cost}}")
Rw('repay','Repayment',lambda t,c,p:f"=Financing!{c}{{f_repay}}")
Rw('lcf','Levered cash flow to equity',lambda t,c,p:f'={c}{{ucf}}+{c}{{draw}}-{c}{{fin}}-{c}{{repay}}',N,True,True)
# lay the rows out
RR={};rr=7
for item in rows:
    if item[0]=='H':rr+=1;rr+=1;continue
    RR[item[1]]=rr;rr+=1
rr=7
cf.cell(5,1,'Month').font=Font(name='Calibri',bold=True);cf.cell(5,2,'Total').font=Font(name='Calibri',bold=True)
for t in range(T+1):c=cf.cell(5,t+FC,t);c.font=HB;c.fill=FILL(TEAL);c.alignment=Alignment(horizontal='center')
cf.cell(5,1).fill=FILL(TEAL);cf.cell(5,1).font=HB;cf.cell(5,2).fill=FILL(TEAL);cf.cell(5,2).font=HB
FIN={}   # filled after the Financing sheet exists
pending=[]
for item in rows:
    if item[0]=='H':rr+=1;section(cf,rr,item[1],min(T+FC,40));rr+=1;continue
    _,key,label,fn,fmt,total,bold=item;cf.cell(rr,1,label).font=Font(name='Calibri',bold=bold)
    for t in range(T+1):
        c=L(t+FC);p=L(t+FC-1) if t>0 else 'B'
        v=fn(t,c,p)
        if key=='m':cf.cell(rr,t+FC,f'=C$5*0+{t}' if False else t);continue
        pending.append((rr,t+FC,v,fmt,bold))
    if total:cf.cell(rr,2,f'=SUM(C{rr}:{L(T+FC)}{rr})').number_format=fmt if fmt!='0' else N;cf.cell(rr,2).font=Font(name='Calibri',bold=True)
    rr+=1
cf.freeze_panes='C6'

# ---------------------------------------------------------------- Financing (monthly, below the cash flow's own columns)
fn_=wb.create_sheet('Financing');banner(fn_,'FINANCING – MURABAHA CONSTRUCTION FACILITY','Draws fund cost after the equity first loss; profit capitalised in construction, paid in operation',min(T+FC,40))
fn_.column_dimensions['A'].width=44;fn_.column_dimensions['B'].width=16
for t in range(T+1):fn_.column_dimensions[L(t+FC)].width=12;c=fn_.cell(5,t+FC,t);c.font=HB;c.fill=FILL(TEAL)
fn_.cell(5,1,'Month').font=HB;fn_.cell(5,1).fill=FILL(TEAL);fn_.cell(5,2,'Total').font=HB;fn_.cell(5,2).fill=FILL(TEAL)
fn_['A7']='Facility size';fn_['B7']=f"=LTC*'Cash Flow'!B{RR['devcost']}";fn_['B7'].number_format=N
fn_['A8']='All-in profit rate';fn_['B8']='=SAIBOR+Margin/10000';fn_['B8'].number_format=P2
fn_['A9']='Equity first (development cost the equity pays before the facility draws)';fn_['B9']=f"='Cash Flow'!B{RR['devcost']}-B7";fn_['B9'].number_format=N
FR={'f_need':11,'f_cumneed':12,'f_draw':13,'f_open':14,'f_profit':15,'f_fee':16,'f_cost':17,'f_repay':18,'f_close':19,'f_dscr':20,'f_ltv':21,'f_cfads':22,'f_value':23}
labels={'f_need':'Cost to fund this month','f_cumneed':'Cost funded so far','f_draw':'Facility drawn','f_open':'Opening balance','f_profit':'Profit (capitalised in construction)','f_fee':'Upfront fee',
        'f_cost':'Profit and fees paid in cash','f_repay':'Repayment','f_close':'Closing balance','f_dscr':'DSCR (trailing 12 months, tested from 12 months after stabilisation)','f_ltv':'LTV (balance on value, tested from 12 months after stabilisation)','f_cfads':'Cash available for debt service (12 months)','f_value':'Value of the income-producing assets'}
for k,rw in FR.items():fn_.cell(rw,1,labels[k]).font=Font(name='Calibri',bold=k in ('f_draw','f_close','f_dscr'))
for t in range(T+1):
    c=L(t+FC);p=L(t+FC-1) if t>0 else None;CF=lambda k:f"'Cash Flow'!{c}{RR[k]}"
    w=lambda k,f,fmt=N:(fn_.cell(FR[k],t+FC,f),setattr(fn_.cell(FR[k],t+FC),'number_format',fmt))
    w('f_need',f"={CF('devcost')}")
    w('f_cumneed',f"=SUM($C{FR['f_need']}:{c}{FR['f_need']})")
    w('f_draw',f"=MAX(0,MIN($B$7-SUM($C{FR['f_draw']}:{p}{FR['f_draw']}),{c}{FR['f_cumneed']}-$B$9-SUM($C{FR['f_draw']}:{p}{FR['f_draw']})))" if p else "=0")
    w('f_open',f"={p}{FR['f_close']}" if p else "=0")
    w('f_profit',f"=IF({CF('build')}=1,{c}{FR['f_open']}*$B$8/12,0)")
    w('f_fee',f"=IF({c}{FR['f_draw']}>0,IF(SUM($C{FR['f_draw']}:{p}{FR['f_draw']})=0,$B$7*UpfrontFee,0),0)" if p else "=0")
    w('f_cost',f"=IF({CF('build')}=1,{c}{FR['f_fee']},{c}{FR['f_open']}*$B$8/12+{c}{FR['f_fee']})")
    w('f_repay',f"=IF({CF('exit')}=1,{c}{FR['f_open']},IF({CF('ops')}=1,MIN({c}{FR['f_open']},$B$7*Amort/12),0))")
    w('f_close',f"={c}{FR['f_open']}+{c}{FR['f_draw']}+{c}{FR['f_profit']}-{c}{FR['f_repay']}")
    a0=L(max(FC,t+FC-11));W12=lambda k:f"SUM('Cash Flow'!{a0}{RR[k]}:{c}{RR[k]})";F12=lambda k:f"SUM({a0}{FR[k]}:{c}{FR[k]})"
    w('f_cfads',f"={W12('noi')}+{W12('hebitda')}")
    w('f_dscr',f"=IF(AND({CF('ops')}=1,{CF('m')}>=BuildMonths+LeaseUp+12,{CF('exit')}=0),{c}{FR['f_cfads']}/MAX(1,{F12('f_cost')}+{F12('f_repay')}),0)",X)
    w('f_value',f"=IF({CF('ops')}=1,{W12('noi')}/ExitYield+{W12('hebitda')}*HotelMult,0)")
    w('f_ltv',f"=IF(AND({c}{FR['f_value']}>0,{CF('m')}>=BuildMonths+LeaseUp+12),{c}{FR['f_close']}/{c}{FR['f_value']},0)",P)
for k in ('f_draw','f_profit','f_fee','f_cost','f_repay'):fn_.cell(FR[k],2,f"=SUM(C{FR[k]}:{L(T+FC)}{FR[k]})").number_format=N
fn_.freeze_panes='C6'
# the Cash Flow rows that read the Financing sheet, and the placeholders
for (rw,cl,v,fmt,bold) in pending:
    v=v.replace('{f_draw}',str(FR['f_draw'])).replace('{f_cost}',str(FR['f_cost'])).replace('{f_repay}',str(FR['f_repay']))
    for k,x in RR.items():v=v.replace('{'+k+'}',str(x))
    c=cf.cell(rw,cl,v);c.number_format=fmt
    if bold:c.font=Font(name='Calibri',bold=True)
# the month row the Cash Flow formulas read: row 5 holds the month numbers; 'Cash Flow'!{c}{m} = the month
for t in range(T+1):cf.cell(RR['m'],t+FC,f'={L(t+FC)}$5').number_format='0'
# the Financing's construction-year profit also counts in the DSCR window: fine; the facility's profit is capitalised (in the balance)

# ---------------------------------------------------------------- Annual summary (SUMIFS on the year row)
an=wb.create_sheet('Annual');banner(an,'ANNUAL SUMMARY (SAR)','SUMIFS of the monthly rows by calendar year',11)
an.column_dimensions['A'].width=44
years=list(range(2026,2033))   # the exit is in 2032
for j,y in enumerate(years,2):c=an.cell(5,j,y);c.font=HB;c.fill=FILL(TEAL);an.column_dimensions[L(j)].width=14
an.cell(5,1,'Year').font=HB;an.cell(5,1).fill=FILL(TEAL)
alines=[('Residential collections released','escrow'),('Retail and office NOI','noi'),('Hotel EBITDA','hebitda'),('Exit proceeds (net)',None),('Development cost','devcost'),('Zakat','zakat'),('Unlevered cash flow','ucf'),('Levered cash flow to equity','lcf')]
for i,(lab,k) in enumerate(alines,6):
    an.cell(i,1,lab).font=Font(name='Calibri',bold=lab.startswith(('Unlevered','Levered')))
    for j,y in enumerate(years,2):
        yr=f"'Cash Flow'!$C${RR['year']}:${L(T+FC)}${RR['year']}"
        f=(f"=SUMIFS('Cash Flow'!$C${RR[k]}:${L(T+FC)}${RR[k]},{yr},{L(j)}$5)" if k else
           f"=SUMIFS('Cash Flow'!$C${RR['exitv']}:${L(T+FC)}${RR['exitv']},{yr},{L(j)}$5)+SUMIFS('Cash Flow'!$C${RR['exith']}:${L(T+FC)}${RR['exith']},{yr},{L(j)}$5)-SUMIFS('Cash Flow'!$C${RR['exitc']}:${L(T+FC)}${RR['exitc']},{yr},{L(j)}$5)")
        an.cell(i,j,f).number_format=NM

# ---------------------------------------------------------------- Waterfall (JV, on the levered cash flow)
wf=wb.create_sheet('Waterfall');banner(wf,'JOINT VENTURE WATERFALL','Pref to all equity → GP catch-up → promote split; on the whole-life levered cash flow',6)
wf.column_dimensions['A'].width=52;wf.column_dimensions['B'].width=18
LCF=f"'Cash Flow'!$C${RR['lcf']}:${L(T+FC)}${RR['lcf']}"
W=[('Equity invested',f"=-SUMIF({LCF},\"<0\")"),('Distributions to equity',f"=SUMIF({LCF},\">0\")"),('Profit to equity','=B6-B5'),
   ('Equity life (years, weighted)',f"=(BuildMonths+HoldMonths)/12/2"),('Preferred return',"=MIN(B7,B5*((1+Pref)^B8-1))"),('GP catch-up',"=MIN(B7-B9,Promote*B9/(1-Promote))"),
   ('Remaining profit',"=B7-B9-B10"),('GP promote on the remaining profit',"=B11*Promote"),('GP total (pro rata + catch-up + promote)',"=(B5+B9)*GPShare+B10+B12+(B11-B12)*GPShare"),
   ('LP total','=B6-B13'),('GP multiple',"=B13/(B5*GPShare)"),('LP multiple',"=B14/(B5*(1-GPShare))"),('Promote paid to the GP',"=B10+B12")]
for i,(lab,f) in enumerate(W,5):wf.cell(i,1,lab);c=wf.cell(i,2,f);c.number_format=X if 'multiple' in lab else '0.0' if 'years' in lab else N

# ---------------------------------------------------------------- Returns
rt=wb.create_sheet('Returns');banner(rt,'RETURNS','Annualised from the monthly cash flows',6)
rt.column_dimensions['A'].width=46;rt.column_dimensions['B'].width=18
UCF=f"'Cash Flow'!$C${RR['ucf']}:${L(T+FC)}${RR['ucf']}";DATES=f"'Cash Flow'!$C${RR['date']}:${L(T+FC)}${RR['date']}"
R_=[('Unlevered IRR',f"=XIRR({UCF},{DATES})",P2),('Levered IRR',f"=XIRR({LCF},{DATES})",P2),('NPV at the discount rate (unlevered)',f"=XNPV(DiscRate,{UCF},{DATES})",N),
    ('Net profit (unlevered)',f"='Cash Flow'!B{RR['ucf']}",N),('Net profit to equity',f"='Cash Flow'!B{RR['lcf']}",N),('Total development cost',f"='Cash Flow'!B{RR['devcost']}+Financing!B{FR['f_profit']}+Financing!B{FR['f_fee']}",N),
    ('Profit on cost',"=B8/B10",P),('Equity multiple',"=Waterfall!B6/Waterfall!B5",X),('Peak debt',f"=MAX(Financing!C{FR['f_close']}:{L(T+FC)}{FR['f_close']})",N),
    ('Peak equity',f"=-MIN('Cash Flow'!C{RR['lcf']+1}:{L(T+FC)}{RR['lcf']+1})",N),('Minimum DSCR',f"=_xlfn.MINIFS(Financing!C{FR['f_dscr']}:{L(T+FC)}{FR['f_dscr']},Financing!C{FR['f_dscr']}:{L(T+FC)}{FR['f_dscr']},\">0\")",X),
    ('Maximum LTV in operation',f"=MAX(Financing!C{FR['f_ltv']}:{L(T+FC)}{FR['f_ltv']})",P),('Exit value',f"='Cash Flow'!B{RR['exitv']}+'Cash Flow'!B{RR['exith']}",N),
    ('LP multiple',"=Waterfall!B16",X),('GP multiple',"=Waterfall!B15",X),('Promote paid to the GP',"=Waterfall!B17",N)]
for i,(lab,f,fm) in enumerate(R_,5):rt.cell(i,1,lab);c=rt.cell(i,2,f);c.number_format=fm
# a cumulative equity row for the peak equity
cf.cell(RR['lcf']+1,1,'Levered cash flow, cumulative').font=Font(name='Calibri',italic=True)
for t in range(T+1):c=L(t+FC);cf.cell(RR['lcf']+1,t+FC,f"=SUM($C{RR['lcf']}:{c}{RR['lcf']})").number_format=N

# ---------------------------------------------------------------- Sensitivity (formula-driven: profit on cost by build cost × residential price)
se=wb.create_sheet('Sensitivity');banner(se,'SENSITIVITY','Net profit (SAR m) for construction cost and residential price, each cell its own formula on the live case',8)
se.column_dimensions['A'].width=30
se['A5']='Construction cost change ↓ / residential price change →';se['A5'].font=Font(name='Calibri',bold=True)
pc=[-0.1,-0.05,0,0.05,0.1];bc=[-0.1,-0.05,0,0.05,0.1]
for j,v in enumerate(pc,2):c=se.cell(5,j,v);c.number_format='+0%;-0%;0%';c.font=HB;c.fill=FILL(TEAL);se.column_dimensions[L(j)].width=14
for i,v in enumerate(bc,6):
    c=se.cell(i,1,v);c.number_format='+0%;-0%;0%';c.font=Font(name='Calibri',bold=True)
    for j in range(2,7):
        f=(f"=(Returns!$B$8+'Cash Flow'!$B${RR['escrow']}*{L(j)}$5*(1-SalesComm)-'Cash Flow'!$B${RR['hard']}*(1+SoftCosts+Contingency)*$A{i})/1000000")
        se.cell(i,j,f).number_format='#,##0.0'
se['A12']='Shading: red below zero.';se['A12'].font=Font(name='Calibri',italic=True,color='667085')
se.conditional_formatting.add('B6:F10',CellIsRule(operator='lessThan',formula=['0'],fill=FILL('FDE2E1')))

# ---------------------------------------------------------------- Checks
ck=wb.create_sheet('Checks');banner(ck,'CHECKS','Each must read OK',5)
ck.column_dimensions['A'].width=70;ck.column_dimensions['B'].width=14;ck.column_dimensions['C'].width=10
CK=[('Construction S-curve sums to 100%',f"='Cash Flow'!B{RR['scurve']}",'=IF(ABS(B5-1)<0.000001,"OK","CHECK")'),
    ('All buyer payments released from escrow by the exit',f"='Cash Flow'!B{RR['collect']}-'Cash Flow'!B{RR['escrow']}",'=IF(ABS(B6)<1,"OK","CHECK")'),
    ('Facility repaid in full at the exit',f"=Financing!{L(T+FC)}{FR['f_close']}",'=IF(ABS(B7)<1,"OK","CHECK")'),
    ('Draws do not exceed the facility',f"=Financing!B{FR['f_draw']}-Financing!B7",'=IF(B8<=1,"OK","CHECK")'),
    ('Minimum DSCR at or above the covenant',"=Returns!B15-MinDSCR",'=IF(B9>=0,"OK","BREACH")'),
    ('Maximum LTV at or below the covenant',"=MaxLTV-Returns!B16",'=IF(B10>=0,"OK","BREACH")'),
    ('Waterfall pays out exactly what equity receives',"=Waterfall!B13+Waterfall!B14-Waterfall!B6",'=IF(ABS(B11)<1,"OK","CHECK")'),
    ('Annual summary equals the monthly total (levered)',f"=SUM(Annual!B13:{L(len(years)+1)}13)-'Cash Flow'!B{RR['lcf']}",'=IF(ABS(B12)<1,"OK","CHECK")')]
for i,(lab,v,f) in enumerate(CK,5):ck.cell(i,1,lab);ck.cell(i,2,v).number_format='#,##0.00';ck.cell(i,3,f).font=Font(name='Calibri',bold=True)
ck['A14']='All checks';ck['A14'].font=Font(name='Calibri',bold=True);ck['C14']='=IF(COUNTIF(C5:C12,"OK")=8,"OK","CHECK")';ck['C14'].font=Font(name='Calibri',bold=True,color=TEAL)
ck.conditional_formatting.add('C5:C14',CellIsRule(operator='notEqual',formula=['"OK"'],fill=FILL('FDE2E1')))

# ---------------------------------------------------------------- Dashboard
db=wb.create_sheet('Dashboard',1);banner(db,'DASHBOARD – AL NAKHEEL GATE','Headline results for the case running on Inputs!C5',6)
db.column_dimensions['A'].width=40;db.column_dimensions['B'].width=20;db.column_dimensions['C'].width=4;db.column_dimensions['D'].width=36;db.column_dimensions['E'].width=18
db['A4']='Case';db['B4']='=Inputs!D5';db['B4'].font=Font(name='Calibri',bold=True,color=TEAL)
db['D4']='Checks';db['E4']='=Checks!C14';db['E4'].font=Font(name='Calibri',bold=True,color=TEAL)
left=[('Levered IRR','=Returns!B6',P2),('Unlevered IRR','=Returns!B5',P2),('Net profit to equity (SAR)','=Returns!B9',NM),('Profit on cost','=Returns!B11',P),('Equity multiple','=Returns!B12',X),('NPV at the discount rate (SAR)','=Returns!B7',NM)]
right=[('Total development cost (SAR)','=Returns!B10',NM),('Peak debt (SAR)','=Returns!B13',NM),('Peak equity (SAR)','=Returns!B14',NM),('Minimum DSCR','=Returns!B15',X),('Maximum LTV in operation','=Returns!B16',P),('Exit value (SAR)','=Returns!B17',NM)]
for i,((a,b,c1),(d,e,f1)) in enumerate(zip(left,right),6):
    db.cell(i,1,a);x=db.cell(i,2,b);x.number_format=c1;x.font=Font(name='Calibri',bold=True,size=12)
    db.cell(i,4,d);y=db.cell(i,5,e);y.number_format=f1;y.font=Font(name='Calibri',bold=True,size=12)
db['A13']='Joint venture';db['A13'].font=H2
for i,(a,b,c1) in enumerate([('LP multiple','=Returns!B18',X),('GP multiple','=Returns!B19',X),('Promote paid to the GP (SAR)','=Returns!B20',NM)],14):db.cell(i,1,a);x=db.cell(i,2,b);x.number_format=c1;x.font=Font(name='Calibri',bold=True)

from openpyxl.chart import BarChart,Reference
ch=BarChart();ch.type='col';ch.grouping='clustered';ch.title='Cash flow by year (SAR)';ch.y_axis.title='SAR';ch.height=7.5;ch.width=17
data=Reference(an,min_col=1,max_col=len(years)+1,min_row=12,max_row=13);ch.add_data(data,from_rows=True,titles_from_data=True)
ch.set_categories(Reference(an,min_col=2,max_col=len(years)+1,min_row=5,max_row=5));ch.y_axis.numFmt='#,##0,,"m"';ch.x_axis.tickLblPos='low';ch.legend.position='b';db.add_chart(ch,'A18')
c2=BarChart();c2.type='col';c2.grouping='stacked';c2.overlap=100;c2.title='Income by stream (SAR)';c2.height=7.5;c2.width=17
c2.add_data(Reference(an,min_col=1,max_col=len(years)+1,min_row=6,max_row=8),from_rows=True,titles_from_data=True)
c2.set_categories(Reference(an,min_col=2,max_col=len(years)+1,min_row=5,max_row=5));c2.y_axis.numFmt='#,##0,,"m"';c2.legend.position='b';db.add_chart(c2,'D18')
wb.calculation.fullCalcOnLoad=True
wb.save(OUT+'demo_raw.xlsx');print('rows',len(RR),'saved')

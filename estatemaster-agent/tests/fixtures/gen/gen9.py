# round 9: a KINAN-like Riyadh tower with residential off-plan sales and an office for hold, two design OPTIONS side by side (A / B) with a
# selector; a JV with a landowner profit share; a lease-by-lease office refurbishment with renewal probabilities; a hotel with a management
# contract whose outputs sit in a horizontal dashboard (labels across, values below); a build-to-rent scheme with a construction loan taken
# out by a permanent loan sized on DSCR, monthly, with some inputs typed as text ("5.25%") and a hidden helper sheet
import openpyxl,datetime
from openpyxl.utils import get_column_letter as L
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m9/'
P='0.00%';N='#,##0'
# ---------- K. Riyadh tower, SAR, options A/B with a selector ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Options';ws['A1']='AL MALQA TOWER – OPTION APPRAISAL (SAR)';ws['A3']='Selected option (A or B)';ws['C3']='A'
ws.append([]);ws.append(['Assumption','Unit','Option A','Option B','Selected'])
rows=[('Residential NSA','sqm',38000,30000),('Residential sale price','SAR/sqm',14200,15500),('Off-plan sales in year 1','%',0.40,0.30),('Office GLA','sqm',9000,16000),('Office rent','SAR/sqm/yr',1650,1650),
 ('Office exit yield','%',0.08,0.08),('Build cost','SAR/sqm GFA',4300,4600),('GFA','sqm',62000,64000),('Land cost','SAR',180000000,180000000),('Construction period','years',3,3),('Murabaha LTC','%',0.55,0.55),('Profit rate','%',0.065,0.065)]
R={}
for i,(lab,u,a,b) in enumerate(rows):
    r=6+i;ws.append([lab,u,a,b,f'=IF($C$3="A",C{r},D{r})']);R[lab]=f'Options!$E${r}'
    for c in 'CDE':ws[f'{c}{r}'].number_format=P if u=='%' else N
cf=wb.create_sheet('Cash Flow');cf['A1']='ANNUAL CASH FLOW (SAR)';cf['A3']='Year'
cl=['Land','Construction','Residential sales','Office NOI','Office sale','Unlevered','Debt drawn','Profit on debt','Debt repaid','Levered']
C={l:5+i for i,l in enumerate(cl)}
for l,r in C.items():cf[f'A{r}']=l
for y in range(0,7):
    c=L(y+2);g=lambda l:f'{c}{C[l]}';cf[f'{c}3']=y;per=R['Construction period']
    cf[g('Land')]=f"=IF({c}$3=0,-{R['Land cost']},0)"
    cf[g('Construction')]=f"=IF(AND({c}$3>=1,{c}$3<={per}),-{R['GFA']}*{R['Build cost']}/{per},0)"
    cf[g('Residential sales')]=f"=IF({c}$3=1,{R['Residential NSA']}*{R['Residential sale price']}*{R['Off-plan sales in year 1']},IF({c}$3={per}+1,{R['Residential NSA']}*{R['Residential sale price']}*(1-{R['Off-plan sales in year 1']}),0))"
    cf[g('Office NOI')]=f"=IF(AND({c}$3>{per},{c}$3<={per}+2),{R['Office GLA']}*{R['Office rent']}*0.92,0)"
    cf[g('Office sale')]=f"=IF({c}$3={per}+2,{R['Office GLA']}*{R['Office rent']}*0.92/{R['Office exit yield']},0)"
    cf[g('Unlevered')]=f"=SUM({c}{C['Land']}:{c}{C['Office sale']})"
    prev=f"SUM($B${C['Debt drawn']}:{L(y+1)}{C['Debt drawn']})+SUM($B${C['Debt repaid']}:{L(y+1)}{C['Debt repaid']})" if y>0 else '0'
    cf[g('Debt drawn')]=f"=-{g('Construction')}*{R['Murabaha LTC']}"
    cf[g('Profit on debt')]=f"=-({prev})*{R['Profit rate']}"
    cf[g('Debt repaid')]=f"=IF({c}$3={per}+1,-({prev}+{g('Debt drawn')}),0)"
    cf[g('Levered')]=f"={g('Unlevered')}+{g('Debt drawn')}+{g('Profit on debt')}+{g('Debt repaid')}"
s=wb.create_sheet('Results');rg=lambda l:f"'Cash Flow'!$B${C[l]}:$H${C[l]}"
for i,(lab,f,fm) in enumerate([('Equity IRR',f'=IRR({rg("Levered")})',P),('Project IRR',f'=IRR({rg("Unlevered")})',P),('Net profit',f'=SUM({rg("Levered")})',N),('Total development cost',f'=-SUM({rg("Land")})-SUM({rg("Construction")})',N),
   ('Profit on cost',f'=B5/B6',P),('Gross development value',f"=SUM({rg('Residential sales')})+SUM({rg('Office sale')})",N),('Equity multiple',f'=SUMIF({rg("Levered")},">0")/-SUMIF({rg("Levered")},"<0")','0.00"x"')]):
    s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
s['A12']='Option shown';s['B12']='=Options!C3'
wb.save(OUT+'tower_options_sar.xlsx')
# ---------- L. JV with landowner profit share, AED ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='JV Terms';ws['A1']='CREEK VIEW JV – DEVELOPER / LANDOWNER (AED)'
r={};row=3
for k,lab,v,f in [('land','Land contributed by landowner (value)',95000000,N),('units','Apartments',420,N),('price','Average price per apartment',1450000,N),('cost','Build cost per apartment',780000,N),('soft','Soft costs (% of build)',0.12,P),
   ('mkt','Marketing & sales (% of revenue)',0.04,P),('dev_eq','Developer equity',120000000,N),('share','Landowner profit share',0.35,P),('pref','Landowner preferred return on land',0.07,P),('yrs','Programme (years)',4,'0')]:
    ws.cell(row,1,lab);c=ws.cell(row,3,v);c.number_format=f;r[k]=f"'JV Terms'!$C${row}";row+=1
s=wb.create_sheet('JV Returns')
items=[('Gross revenue',f"={r['units']}*{r['price']}",N),('Build cost',f"={r['units']}*{r['cost']}",N),('Soft costs',f"=B4*{r['soft']}",N),('Marketing & sales',f"=B3*{r['mkt']}",N),
 ('Development profit before land',"=B3-B4-B5-B6",N),('Landowner preferred return',f"={r['land']}*((1+{r['pref']})^{r['yrs']}-1)",N),('Profit after pref','=B7-B8',N),('Landowner share of profit',f"=MAX(0,B9)*{r['share']}",N),
 ('Developer profit','=B9-B10',N),('Landowner total return',f"=B8+B10",N),('Developer return on equity',f"=B11/{r['dev_eq']}",P),('Developer IRR (annualised)',f"=(1+B13)^(1/{r['yrs']})-1",P),('Landowner IRR on land value',f"=((B12+{r['land']})/{r['land']})^(1/{r['yrs']})-1",P),('Profit on cost',f"=B7/(B4+B5+B6+{r['land']})",P)]
for i,(lab,f,fm) in enumerate(items):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'jv_landowner_aed.xlsx')
# ---------- M. office refurbishment, GBP, lease-by-lease with renewal probability ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Rent Roll';ws['A1']='1 FARRINGDON STREET – REFURBISHMENT (GBP)'
ws.append([]);ws.append(['Tenant','Area (sq ft)','Passing rent (£/sq ft)','Lease expiry (year)','Renewal probability','ERV (£/sq ft)','Void if vacated (months)'])
ten=[('Arden Legal',18000,58,2,0.6,72,12),('Blue Cedar Media',12500,61,3,0.5,72,12),('Corvex Capital',22000,66,5,0.75,74,9),('Dunmore Health',9000,52,1,0.4,70,15),('Elmstone Partners',15500,63,4,0.65,73,12)]
for t in ten:ws.append(list(t))
a=wb.create_sheet('Inputs');a['A1']='REFURBISHMENT & EXIT'
I={};row=3
for k,lab,v,f in [('price','Purchase price',78000000,N),('sdlt','Purchase costs',0.068,P),('refurb','Refurbishment cost (£/sq ft)',145,N),('ey','Exit yield',0.0525,P),('hold','Hold (years)',6,'0'),('ltv','LTV',0.55,P),('rate','Interest rate',0.0595,P),('growth','ERV growth',0.025,P)]:
    a.cell(row,1,lab);c=a.cell(row,3,v);c.number_format=f;I[k]=f'Inputs!$C${row}';row+=1
cf=wb.create_sheet('CF');cf['A1']='ANNUAL CASH FLOW (£)';cf['A3']='Year'
for y in range(0,8):cf[f'{L(y+2)}3']=y
for i,t in enumerate(ten):
    rr=5+i;cf[f'A{rr}']=t[0]+' rent';tr=4+i
    for y in range(0,8):
        c=L(y+2)
        cf[f'{c}{rr}']=(f"=IF(OR({c}$3=0,{c}$3>{I['hold']}+1),0,IF({c}$3<='Rent Roll'!$D${tr},'Rent Roll'!$B${tr}*'Rent Roll'!$C${tr},'Rent Roll'!$B${tr}*'Rent Roll'!$F${tr}*(1+{I['growth']})^{c}$3*('Rent Roll'!$E${tr}+(1-'Rent Roll'!$E${tr})*MAX(0,1-'Rent Roll'!$G${tr}/12*({c}$3='Rent Roll'!$D${tr}+1)))))")
tot=5+len(ten);cf[f'A{tot}']='Net rent';cf[f'A{tot+1}']='Refurbishment';cf[f'A{tot+2}']='Acquisition';cf[f'A{tot+3}']='Sale';cf[f'A{tot+4}']='Unlevered';cf[f'A{tot+5}']='Debt';cf[f'A{tot+6}']='Levered'
for y in range(0,8):
    c=L(y+2);nx=L(y+3)
    cf[f'{c}{tot}']=f'=SUM({c}5:{c}{tot-1})*0.95'
    cf[f'{c}{tot+1}']=f"=IF({c}$3=1,-SUM('Rent Roll'!$B$4:$B$8)*{I['refurb']},0)"
    cf[f'{c}{tot+2}']=f"=IF({c}$3=0,-{I['price']}*(1+{I['sdlt']}),0)"
    cf[f'{c}{tot+3}']=(f"=IF({c}$3={I['hold']},{nx}{tot}/{I['ey']},0)" if y<7 else '=0')
    cf[f'{c}{tot+4}']=f'={c}{tot}+{c}{tot+1}+{c}{tot+2}+{c}{tot+3}'
    cf[f'{c}{tot+5}']=f"=IF({c}$3=0,{I['price']}*{I['ltv']},IF({c}$3<={I['hold']},-{I['price']}*{I['ltv']}*{I['rate']},0))-IF({c}$3={I['hold']},{I['price']}*{I['ltv']},0)"
    cf[f'{c}{tot+6}']=f'={c}{tot+4}+{c}{tot+5}'
s=wb.create_sheet('Summary');rg=lambda r_:f'CF!$B${r_}:$I${r_}'
for i,(lab,f,fm) in enumerate([('Levered IRR',f'=IRR({rg(tot+6)})',P),('Unlevered IRR',f'=IRR({rg(tot+4)})',P),('Equity multiple',f'=SUMIF({rg(tot+6)},">0")/-SUMIF({rg(tot+6)},"<0")','0.00"x"'),('Net profit',f'=SUM({rg(tot+6)})',N),
   ('WAULT at purchase (years)',"=SUMPRODUCT('Rent Roll'!B4:B8,'Rent Roll'!C4:C8,'Rent Roll'!D4:D8)/SUMPRODUCT('Rent Roll'!B4:B8,'Rent Roll'!C4:C8)",'0.0')]):
    s.cell(3+i,1,lab);c=s.cell(3+i,3,f);c.number_format=fm
wb.save(OUT+'office_refurb_gbp.xlsx')
# ---------- N. hotel with a management contract, EUR, horizontal dashboard ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Assumptions';ws['A1']='HOTEL LISBOA RIBEIRA – MANAGED HOTEL (EUR)'
I={};row=3
for k,lab,v,f in [('keys','Keys',210,N),('adr','ADR (EUR)',245,N),('occ','Occupancy',0.78,P),('fnb','F&B revenue (% of rooms)',0.35,P),('gop','GOP margin',0.38,P),('base','Base management fee (% of revenue)',0.03,P),
   ('inc','Incentive fee (% of GOP)',0.08,P),('ffe','FF&E reserve (% of revenue)',0.04,P),('price','Purchase price (EUR)',98000000,N),('cap','Exit cap rate',0.0675,P),('g','RevPAR growth',0.03,P),('ltv','LTV',0.5,P),('rate','Interest rate',0.052,P)]:
    ws.cell(row,1,lab);c=ws.cell(row,2,v);c.number_format=f;I[k]=f'Assumptions!$B${row}';row+=1
cf=wb.create_sheet('Operations');cf['A1']='ANNUAL OPERATIONS (EUR)';cf['A3']='Year';ol=['Rooms revenue','F&B revenue','Total revenue','GOP','Base fee','Incentive fee','FF&E reserve','EBITDA','Acquisition','Sale','Debt','Levered','Unlevered']
O={l:5+i for i,l in enumerate(ol)}
for l,r_ in O.items():cf[f'A{r_}']=l
for y in range(0,7):
    c=L(y+2);g=lambda l:f'{c}{O[l]}';cf[f'{c}3']=y;op_=f'AND({c}$3>=1,{c}$3<=5)';nxt=f"{I['keys']}*365*{I['adr']}*{I['occ']}*(1+{I['g']})^5*(1+{I['fnb']})"
    cf[g('Rooms revenue')]=f"=IF({op_},{I['keys']}*365*{I['adr']}*{I['occ']}*(1+{I['g']})^({c}$3-1),0)"
    cf[g('F&B revenue')]=f"={g('Rooms revenue')}*{I['fnb']}";cf[g('Total revenue')]=f"={g('Rooms revenue')}+{g('F&B revenue')}"
    cf[g('GOP')]=f"={g('Total revenue')}*{I['gop']}";cf[g('Base fee')]=f"=-{g('Total revenue')}*{I['base']}";cf[g('Incentive fee')]=f"=-{g('GOP')}*{I['inc']}";cf[g('FF&E reserve')]=f"=-{g('Total revenue')}*{I['ffe']}"
    cf[g('EBITDA')]=f"={g('GOP')}+{g('Base fee')}+{g('Incentive fee')}+{g('FF&E reserve')}"
    cf[g('Acquisition')]=f"=IF({c}$3=0,-{I['price']},0)"
    cf[g('Sale')]=f"=IF({c}$3=5,{nxt}*({I['gop']}*(1-{I['inc']})-{I['base']}-{I['ffe']})/{I['cap']},0)"
    cf[g('Debt')]=f"=IF({c}$3=0,{I['price']}*{I['ltv']},IF({op_},-{I['price']}*{I['ltv']}*{I['rate']},0))-IF({c}$3=5,{I['price']}*{I['ltv']},0)"
    cf[g('Unlevered')]=f"={g('EBITDA')}+{g('Acquisition')}+{g('Sale')}";cf[g('Levered')]=f"={g('Unlevered')}+{g('Debt')}"
d=wb.create_sheet('Dashboard');d['A1']='RETURNS DASHBOARD';rg=lambda l:f'Operations!$B${O[l]}:$H${O[l]}'
heads=[('Levered IRR',f'=IRR({rg("Levered")})',P),('Unlevered IRR',f'=IRR({rg("Unlevered")})',P),('Equity multiple',f'=SUMIF({rg("Levered")},">0")/-SUMIF({rg("Levered")},"<0")','0.00"x"'),('Year 1 EBITDA',f"=Operations!C{O['EBITDA']}",N),('Net profit',f'=SUM({rg("Levered")})',N),('Price per key',f"={I['price']}/{I['keys']}",N)]
for j,(lab,f,fm) in enumerate(heads):d.cell(3,1+j*2,lab);c=d.cell(4,1+j*2,f);c.number_format=fm
wb.save(OUT+'hotel_managed_eur.xlsx')
# ---------- O. build-to-rent, USD, monthly construction + perm takeout sized on DSCR; a text-typed input; a hidden helper sheet ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='PINE RIDGE BUILD-TO-RENT – USD'
I={};row=3
for k,lab,v,f in [('units','Homes',260,N),('rent','Rent per home per month',2150,N),('occ','Stabilised occupancy',0.95,P),('opx','Opex per home per year',7800,N),('cost','Total development cost',78000000,N),('months','Construction months',20,'0'),
   ('ccr','Construction loan rate',0.0775,P),('cltc','Construction LTC',0.6,P),('dscr','Permanent loan DSCR',1.25,'0.00"x"'),('prate','Permanent loan rate',0.0575,P),('amort','Amortisation (years)',30,'0'),('ec','Exit cap rate',0.0525,P),('hold','Hold after completion (years)',5,'0')]:
    ws.cell(row,1,lab);c=ws.cell(row,2,v);c.number_format=f;I[k]=f'Inputs!$B${row}';row+=1
ws.cell(row,1,'Rent growth');ws.cell(row,2,'3.0%');I['g']='Calc!$B$2';row+=1   # typed as text, the way people paste numbers
h=wb.create_sheet('Calc');h['A1']='helper';h['A2']='rent growth as a number';h['B2']='=VALUE(SUBSTITUTE(Inputs!B16,"%",""))/100'
h['A3']='Stabilised NOI';h['B3']=f"={I['units']}*({I['rent']}*12*{I['occ']}-{I['opx']})";h['A4']='Perm loan';h['B4']=f"=B3/{I['dscr']}/(-PMT({I['prate']}/12,{I['amort']}*12,1)*12)"
h['A5']='Construction loan';h['B5']=f"={I['cost']}*{I['cltc']}";h['A6']='Construction interest';h['B6']=f"=B5*{I['ccr']}*{I['months']}/12*0.55"
h['A7']='Exit value';h['B7']=f"=B3*(1+B2)^{I['hold']}/{I['ec']}";h['A8']='Perm balance at exit';h['B8']=f"=-FV({I['prate']}/12,{I['hold']}*12,PMT({I['prate']}/12,{I['amort']}*12,B4),B4)"
h['A9']='Equity in';h['B9']=f"={I['cost']}-B5+B6";h['A10']='Cash-out at takeout';h['B10']='=MAX(0,B4-B5)'
h['A11']='Annual levered cash flow';h['B11']=f"=B3-(-PMT({I['prate']}/12,{I['amort']}*12,B4)*12)"
h.sheet_state='hidden'
s=wb.create_sheet('Returns')
for i,(lab,f,fm) in enumerate([('Yield on cost',f"=Calc!B3/{I['cost']}",P),('Permanent loan',"=Calc!B4",N),('Equity multiple',f"=(Calc!B10+Calc!B11*{I['hold']}+Calc!B7-Calc!B8)/Calc!B9",'0.00"x"'),
   ('Levered IRR (approx. annual)',f"=((Calc!B10+Calc!B11*{I['hold']}+Calc!B7-Calc!B8)/Calc!B9)^(1/({I['hold']}+{I['months']}/12))-1",P),('Development profit',"=Calc!B7-Inputs!B7",N)]):
    s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'btr_usd.xlsx')
print('ok')

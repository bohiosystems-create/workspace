# round 15: five more model types
#  ijara  - Muscat hotel financed with an Ijara (lease-to-own), OMR
#  vine   - Stellenbosch vineyard, ZAR, hectares x tonnes per hectare x price per tonne, replanting cycle
#  slb    - Warsaw logistics sale-and-leaseback, PLN, CPI indexation with a cap and a floor (MIN/MAX)
#  cogp   - co-GP JV, USD, three-tier promote on the equity multiple (MIN/MAX tiers)
#  names  - Singapore build-to-rent, SGD, every input a defined name used by the formulas
import openpyxl,os
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.defined_name import DefinedName
OUT='/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/m15/';os.makedirs(OUT+'calc',exist_ok=True)
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

# ---------- Ijara hotel, OMR ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='AL MOUJ HOTEL – IJARA FINANCED (OMR)'
I=inputs(ws,[('cost','Development cost (OMR)',38000000,N),('fin','Ijara financing (% of cost)',0.6,P),('rate','Ijara rental rate (profit rate)',0.058,P),('tenor','Ijara tenor (years)',10,'0'),
  ('keys','Keys',260,N),('adr','ADR (OMR)',72,N2),('occ','Occupancy',0.66,P),('other','Other revenue (% of rooms)',0.55,P),('gop','GOP margin',0.34,P),('exit','Exit cap rate',0.085,P),('hold','Hold (years)',8,'0')])
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';rows=['Revenue','GOP','Ijara rentals','Development','Ijara funding','Ijara buy-out','Sale','Equity cash flow','Project cash flow']
R={l:4+i for i,l in enumerate(rows)}
for l,r in R.items():cf[f'A{r}']=l
for y in range(0,10):
    c=L(y+2);cf[f'{c}3']=y;on=f"({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}{R["Revenue"]}']=f"={on}*{I['keys']}*365*{I['adr']}*{I['occ']}*(1+{I['other']})*1.03^MAX(0,{c}$3-1)"
    cf[f'{c}{R["GOP"]}']=f"={c}{R['Revenue']}*{I['gop']}"
    cf[f'{c}{R["Ijara rentals"]}']=f"=-{on}*IF({c}$3<={I['tenor']},-PMT({I['rate']},{I['tenor']},{I['cost']}*{I['fin']}),0)"
    cf[f'{c}{R["Development"]}']=f"=IF({c}$3=0,-{I['cost']},0)"
    cf[f'{c}{R["Ijara funding"]}']=f"=IF({c}$3=0,{I['cost']}*{I['fin']},0)"
    cf[f'{c}{R["Ijara buy-out"]}']=f"=IF({c}$3={I['hold']},-IF({I['hold']}<{I['tenor']},PV({I['rate']},{I['tenor']}-{I['hold']},PMT({I['rate']},{I['tenor']},{I['cost']}*{I['fin']}))*-1,0),0)"
    cf[f'{c}{R["Sale"]}']=f"=IF({c}$3={I['hold']},{c}{R['GOP']}*1.03/{I['exit']},0)"
    cf[f'{c}{R["Equity cash flow"]}']=f"=SUM({c}{R['GOP']}:{c}{R['Sale']})"
    cf[f'{c}{R["Project cash flow"]}']=f"={c}{R['GOP']}+{c}{R['Development']}+{c}{R['Sale']}"
last=L(11)
summary(wb,'Returns',[('Equity IRR',f"=IRR('Cash Flow'!B{R['Equity cash flow']}:{last}{R['Equity cash flow']})",P),('Project IRR',f"=IRR('Cash Flow'!B{R['Project cash flow']}:{last}{R['Project cash flow']})",P),
  ('Net profit',f"=SUM('Cash Flow'!B{R['Project cash flow']}:{last}{R['Project cash flow']})",N),('Ijara rental cover (year 1)',f"='Cash Flow'!C{R['GOP']}/-'Cash Flow'!C{R['Ijara rentals']}",'0.00"x"'),('Total development cost',f"={I['cost']}",N)])
wb.save(OUT+'ijara_omr.xlsx')

# ---------- vineyard, ZAR ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Farm';ws['A1']='DE WAAL ESTATE – VINEYARD INVESTMENT (ZAR)'
I=inputs(ws,[('price','Purchase price (R)',96000000,N),('ha','Hectares under vine',62,N2),('yield','Yield (tonnes per hectare)',8.5,N2),('tp','Grape price (R per tonne)',7800,N),('cost','Farming cost (R per hectare)',58000,N),
  ('replant','Replanting (hectares per year)',4,N2),('rcost','Replanting cost (R per hectare)',260000,N),('lost','Yield lost on replanted blocks (years)',3,'0'),('land','Land value growth',0.05,P),('hold','Hold (years)',10,'0')])
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';cf['A4']='Bearing hectares';cf['A5']='Revenue';cf['A6']='Farming cost';cf['A7']='Replanting';cf['A8']='Sale';cf['A9']='Purchase';cf['A10']='Net cash flow'
for y in range(0,12):
    c=L(y+2);cf[f'{c}3']=y;on=f"({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}4']=f"={on}*({I['ha']}-MIN({c}$3,{I['lost']})*{I['replant']})"
    cf[f'{c}5']=f"={c}4*{I['yield']}*{I['tp']}*1.045^MAX(0,{c}$3-1)";cf[f'{c}6']=f"=-{on}*{I['ha']}*{I['cost']}*1.05^MAX(0,{c}$3-1)";cf[f'{c}7']=f"=-{on}*{I['replant']}*{I['rcost']}"
    cf[f'{c}8']=f"=IF({c}$3={I['hold']},{I['price']}*(1+{I['land']})^{c}$3,0)";cf[f'{c}9']=f"=IF({c}$3=0,-{I['price']},0)";cf[f'{c}10']=f"=SUM({c}5:{c}9)"
summary(wb,'Returns',[('Unlevered IRR',"=IRR('Cash Flow'!B10:M10)",P),('Net profit',"=SUM('Cash Flow'!B10:M10)",N),('Year 1 operating margin',"=('Cash Flow'!C5+'Cash Flow'!C6)/'Cash Flow'!C5",P),('Cash yield (year 1)',f"=('Cash Flow'!C5+'Cash Flow'!C6+'Cash Flow'!C7)/{I['price']}",P)])
wb.save(OUT+'vine_zar.xlsx')

# ---------- sale and leaseback, PLN ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Lease';ws['A1']='WARSAW EAST DC – SALE AND LEASEBACK (PLN)'
I=inputs(ws,[('price','Purchase price (PLN)',210000000,N),('rent','Initial rent (PLN p.a.)',14200000,N),('cpi','CPI forecast',0.045,P),('cap','Indexation cap',0.035,P),('floor','Indexation floor',0.01,P),
  ('term','Lease term (years)',12,'0'),('exit','Exit yield',0.0725,P),('hold','Hold (years)',10,'0'),('costs','Acquisition costs',0.025,P),('ltv','LTV',0.55,P),('rate','Loan rate (WIBOR + margin)',0.071,P)])
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';cf['A4']='Indexation applied';cf['A5']='Rent';cf['A6']='Sale';cf['A7']='Purchase';cf['A8']='Unlevered';cf['A9']='Debt';cf['A10']='Levered'
for y in range(0,12):
    c=L(y+2);p=L(y+1);cf[f'{c}3']=y;on=f"({c}$3>=1)*({c}$3<={I['hold']})"
    cf[f'{c}4']=f"=MAX({I['floor']},MIN({I['cap']},{I['cpi']}))"
    cf[f'{c}5']=(f"={on}*{I['rent']}" if y==1 else (f"={on}*{p}5*(1+{c}4)" if y>1 else "=0"))
    cf[f'{c}6']=f"=IF({c}$3={I['hold']},{c}5*(1+{c}4)/{I['exit']},0)";cf[f'{c}7']=f"=IF({c}$3=0,-{I['price']}*(1+{I['costs']}),0)";cf[f'{c}8']=f"=SUM({c}5:{c}7)"
    cf[f'{c}9']=f"=IF({c}$3=0,{I['price']}*{I['ltv']},0)-{on}*{I['price']}*{I['ltv']}*{I['rate']}-IF({c}$3={I['hold']},{I['price']}*{I['ltv']},0)";cf[f'{c}10']=f"={c}8+{c}9"
summary(wb,'Returns',[('Unlevered IRR',"=IRR('Cash Flow'!B8:M8)",P),('Levered IRR',"=IRR('Cash Flow'!B10:M10)",P),('Net profit',"=SUM('Cash Flow'!B8:M8)",N),('Net initial yield',f"={I['rent']}/({I['price']}*(1+{I['costs']}))",P),('Equity multiple',"=SUMIF('Cash Flow'!B10:M10,\">0\")/-SUMIF('Cash Flow'!B10:M10,\"<0\")",'0.00"x"')])
wb.save(OUT+'slb_pln.xlsx')

# ---------- co-GP JV, USD, tiered promote on the multiple ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Deal';ws['A1']='HARBORVIEW CO-GP JV – PROMOTE WATERFALL (USD)'
I=inputs(ws,[('eq','Total equity',60000000,N),('lp','LP share of equity',0.9,P),('mult','Project equity multiple',1.95,'0.00"x"'),('years','Hold (years)',5,'0'),
  ('t1','Tier 1 hurdle (multiple)',1.5,'0.00"x"'),('p1','Promote above tier 1',0.15,P),('t2','Tier 2 hurdle (multiple)',1.8,'0.00"x"'),('p2','Promote above tier 2',0.25,P),('t3','Tier 3 hurdle (multiple)',2.2,'0.00"x"'),('p3','Promote above tier 3',0.35,P)])
s=wb.create_sheet('Waterfall');rows=[('Total distributions',f"={I['eq']}*{I['mult']}",N),('Profit','=B3-'+I['eq'],N),
 ('Profit in tier 1 (to 1.5x)',f"=MAX(0,MIN(B3,{I['eq']}*{I['t1']})-{I['eq']})",N),('Profit in tier 2',f"=MAX(0,MIN(B3,{I['eq']}*{I['t2']})-{I['eq']}*{I['t1']})",N),
 ('Profit in tier 3',f"=MAX(0,MIN(B3,{I['eq']}*{I['t3']})-{I['eq']}*{I['t2']})",N),('Profit above tier 3',f"=MAX(0,B3-{I['eq']}*{I['t3']})",N),
 ('GP promote',f"=B6*{I['p1']}+B7*{I['p2']}+B8*{I['p3']}",N),('GP total',f"=B9+(B4-B9)*(1-{I['lp']})+{I['eq']}*(1-{I['lp']})",N),('LP total',f"=B3-B10",N),
 ('LP multiple',f"=B11/({I['eq']}*{I['lp']})",'0.00"x"'),('GP multiple',f"=B10/({I['eq']}*(1-{I['lp']}))",'0.00"x"'),('LP IRR',f"=B12^(1/{I['years']})-1",P),('GP IRR',f"=B13^(1/{I['years']})-1",P),('Net profit','=B4',N),('Equity multiple',f"={I['mult']}",'0.00"x"')]
for i,(lab,f,fm) in enumerate(rows):s.cell(3+i,1,lab);c=s.cell(3+i,2,f);c.number_format=fm
wb.save(OUT+'cogp_usd.xlsx')

# ---------- Singapore BTR with defined names, SGD ----------
wb=openpyxl.Workbook();ws=wb.active;ws.title='Inputs';ws['A1']='TAMPINES LIVING – BUILD TO RENT (SGD)'
NM=[('Units','Units',420,N),('RentPerUnit','Monthly rent per unit (S$)',3600,N),('Occupancy','Occupancy',0.95,P),('OpexRatio','Opex ratio',0.27,P),('LandCost','Land cost (S$)',118000000,N),('BuildCost','Build cost (S$)',196000000,N),('ExitCap','Exit cap rate',0.0425,P),('Growth','Rent growth',0.025,P)]
for i,(nm,lab,v,f) in enumerate(NM,start=3):
    ws.cell(i,1,lab);c=ws.cell(i,2,v);c.number_format=f
    wb.defined_names[nm]=DefinedName(nm,attr_text=f"Inputs!$B${i}")
cf=wb.create_sheet('Cash Flow');cf['A3']='Year';cf['A4']='NOI';cf['A5']='Capex';cf['A6']='Sale';cf['A7']='Net cash flow'
for y in range(0,8):
    c=L(y+2);cf[f'{c}3']=y
    cf[f'{c}4']=f"=IF({c}$3>=3,Units*RentPerUnit*12*Occupancy*(1-OpexRatio)*(1+Growth)^({c}$3-3),0)"
    cf[f'{c}5']=f"=IF({c}$3=0,-LandCost,0)-IF(AND({c}$3>=1,{c}$3<=2),BuildCost/2,0)"
    cf[f'{c}6']=f"=IF({c}$3=7,{c}4*(1+Growth)/ExitCap,0)";cf[f'{c}7']=f"=SUM({c}4:{c}6)"
summary(wb,'Returns',[('Unlevered IRR',"=IRR('Cash Flow'!B7:I7)",P),('Net profit',"=SUM('Cash Flow'!B7:I7)",N),('Total development cost','=LandCost+BuildCost',N),('Yield on cost',"='Cash Flow'!E4/B5",P),('Profit on cost','=B4/B5',P)])
wb.save(OUT+'names_sgd.xlsx')
print('ok')

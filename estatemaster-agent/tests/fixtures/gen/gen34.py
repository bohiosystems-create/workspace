# Round 34 fixture (synthetic): a SAR development held in a fund, laid out the way fund models often are. Amounts in SAR '000 stated once
# at the top of the Summary; a scenario switch (1 Base, 2 Upside, 3 Downside) that each lever reads through CHOOSE; a quarterly timeline
# with dated quarter ends; IRRs annualised from quarterly cash flows inside IFERROR(...,0); a fund gross IRR labelled "pre-promote" beside
# an LP net IRR "after all fees & promote"; a sponsor profit beside the project profit; a fund term in quarters that times the exit.
import openpyxl,sys,datetime
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.defined_name import DefinedName
out=sys.argv[1];Q=24;C0=5   # quarters 1..24 in columns E..AB
wb=openpyxl.Workbook();a=wb.active;a.title='Assumptions'
a['B2']='Al Rimal Riverside Fund (illustrative) · assumptions';a['B3']="SAR '000 unless stated"
a['B5']='Model start date (first day of Q1)';a['C5']=datetime.datetime(2027,1,1);a['C5'].number_format='dd-mmm-yy';a['D5']='date'
a['B6']='Fund term';a['C6']=Q;a['D6']='quarters'
a['B7']='Active scenario (1 = Base, 2 = Upside, 3 = Downside)';a['C7']=1;a['D7']='selector'
a['C9']='Base';a['D9']='Upside';a['E9']='Downside';a['F9']='Live'
lev=[(10,'Sales price adjustment vs base',0,0.05,-0.10),(11,'Hard cost overrun on all packages',0,-0.02,0.08),(12,'3M SAIBOR (average over term)',0.05,0.045,0.06)]
pf='0.0%;\\(0.0%\\);\\-'
for r,l,b,u,d in lev:
    a[f'B{r}']=l
    for c,v in zip('CDE',(b,u,d)):a[f'{c}{r}']=v;a[f'{c}{r}'].number_format=pf
    a[f'F{r}']=f'=CHOOSE(Scenario,C{r},D{r},E{r})';a[f'F{r}'].number_format=pf
inp=[(14,'Land',300000,'#,##0'),(15,'Hard cost (total, excl. overrun)',900000,'#,##0'),(16,'Construction start (quarter)',2,'0'),(17,'Construction duration (quarters)',10,'0'),
 (18,'Gross sales value (base)',1800000,'#,##0'),(19,'Sales start (quarter)',13,'0'),(20,'Facility size as % of hard cost (LTC)',0.40,'0.0%'),(21,'Margin over SAIBOR',0.02,'0.00%'),
 (22,'Management fee (a year, on commitments)',0.015,'0.00%'),(23,'LP commitments',800000,'#,##0'),(24,'Preferred return (a year)',0.05,'0.0%'),(25,'Promote above the preferred return',0.30,'0.0%'),
 (26,'Bulk sale discount at fund term',0.10,'0.0%')]
for r,l,v,f in inp:a[f'B{r}']=l;a[f'C{r}']=v;a[f'C{r}'].number_format=f
for nm,ref in (('Scenario','$C$7'),('Model_Start','$C$5'),('Fund_Term','$C$6')):
    wb.defined_names[nm]=DefinedName(nm,attr_text=f"Assumptions!{ref}")
c=wb.create_sheet('Cash Flow');c['B1']="Al Rimal Riverside Fund · quarterly cash flow (SAR '000)"
c['B3']='Quarter';c['B4']='Quarter end'
lab={6:'Land',7:'Hard cost',8:'Sales receipts',9:'Project cash flow (unlevered)',10:'Opening facility balance',11:'Facility drawdown',12:'Interest paid',
 13:'Facility repayment',14:'Closing facility balance',15:'Fund management fee',16:'Fund gross cash flow (levered, pre-promote)',17:'Promote paid to the sponsor',
 18:'LP net cash flow',19:'Sponsor cash flow (promote)'}
for r,l in lab.items():c[f'B{r}']=l
A='Assumptions!'
for k in range(Q):
    col=L(C0+k);p=L(C0+k-1);q=f'{col}$3'
    c[f'{col}3']=k+1;c[f'{col}4']=f'=EOMONTH(Model_Start,3*{col}3-1)';c[f'{col}4'].number_format='mmm-yy'
    c[f'{col}6']=f'=IF({q}=1,-{A}$C$14,0)'
    c[f'{col}7']=f'=IF(AND({q}>={A}$C$16,{q}<{A}$C$16+{A}$C$17,{q}<=Fund_Term),-{A}$C$15*(1+{A}$F$11)/{A}$C$17,0)'
    c[f'{col}8']=(f'=IF({q}>Fund_Term,0,IF(AND({q}>={A}$C$19,{q}<{A}$C$19+8),{A}$C$18*(1+{A}$F$10)/8,0)'
                  f'+IF({q}=Fund_Term,{A}$C$18*(1+{A}$F$10)*MAX(0,{A}$C$19+8-Fund_Term-1)/8*(1-{A}$C$26),0))')
    c[f'{col}9']=f'=SUM({col}6:{col}8)'
    c[f'{col}10']='=0' if k==0 else f'={p}14'
    c[f'{col}11']=f'=-{col}7*{A}$C$20'
    c[f'{col}12']=f'=-{col}10*({A}$F$12+{A}$C$21)/4'
    c[f'{col}13']=f'=IF({q}=Fund_Term,-({col}10+{col}11),-MIN({col}10+{col}11,MAX(0,{col}8)))'
    c[f'{col}14']=f'={col}10+{col}11+{col}13'
    c[f'{col}15']=f'=IF({q}<=Fund_Term,-{A}$C$23*{A}$C$22/4,0)'
    c[f'{col}16']=f'={col}9+{col}11+{col}12+{col}13+{col}15'
    c[f'{col}17']=f'=IF({q}=Fund_Term,-{A}$C$25*MAX(0,SUM($E16:$AB16)-{A}$C$23*((1+{A}$C$24)^(Fund_Term/4)-1)),0)'
    c[f'{col}18']=f'={col}16+{col}17'
    c[f'{col}19']=f'=-{col}17'
last=L(C0+Q-1);rg=lambda r:f"'Cash Flow'!$E${r}:${last}${r}"
r_=wb.create_sheet('Returns');r_['B2']="Returns (SAR '000 unless stated)"
rows=[(5,'Project unlevered IRR',f'=IFERROR((1+IRR({rg(9)}))^4-1,0)','0.00%'),(6,'Fund gross IRR (levered, pre-promote)',f'=IFERROR((1+IRR({rg(16)}))^4-1,0)','0.00%'),
 (7,'LP net IRR (after all fees & promote)',f'=IFERROR((1+IRR({rg(18)}))^4-1,0)','0.00%'),(8,'Project profit (unlevered)',f'=SUM({rg(9)})','#,##0'),
 (9,'Sponsor total profit (promote)',f'=SUM({rg(19)})','#,##0'),(10,'Profit on cost',f'=C8/-SUM({rg(6)},{rg(7)})','0.0%'),(11,'Peak facility balance',f'=MAX({rg(14)})','#,##0')]
for r,l,f,fm in rows:r_[f'B{r}']=l;r_[f'C{r}']=f;r_[f'C{r}'].number_format=fm
s=wb.create_sheet('Summary',0);s['B1']='Deal Summary · Al Rimal Riverside Fund (illustrative)';s['B3']="SAR '000 unless stated. All figures link to the calculation tabs."
s['B5']='Project';s['E5']='Partner returns'
left=[(6,'Gross development value','=Assumptions!C18*(1+Assumptions!F10)','#,##0'),(7,'Total development budget',f"=-SUM({rg(6)},{rg(7)})",'#,##0'),
 (8,'Project profit (unlevered)','=Returns!C8','#,##0'),(9,'Profit on cost','=Returns!C10','0.0%'),(10,'Project unlevered IRR','=Returns!C5','0.0%')]
right=[(6,'Fund gross IRR (levered, pre-promote)','=Returns!C6','0.0%'),(7,'LP net IRR (after all fees & promote)','=Returns!C7','0.0%'),
 (8,'Sponsor total profit incl. promote','=Returns!C9','#,##0'),(9,'Peak facility balance','=Returns!C11','#,##0')]
for r,l,f,fm in left:s[f'B{r}']=l;s[f'C{r}']=f;s[f'C{r}'].number_format=fm
for r,l,f,fm in right:s[f'E{r}']=l;s[f'F{r}']=f;s[f'F{r}'].number_format=fm
wb.save(out)

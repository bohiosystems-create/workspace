# Round 48 fixture (synthetic): a UK single-let bank branch on a long lease (GBP, quarterly), with made-up figures.
#  r48_stnl_branch_gbp: rent paid quarterly; five-yearly reviews linked to CPI, compounded and collared (1% floor, 3% cap a year) and
#  upward-only; the purchase price grossed up for SDLT and fees; senior debt at a fixed margin over a typed swap rate, interest-only; the
#  returns headed "Property IRR" and "Equity IRR", each by XIRR on the quarter dates, with a net initial yield and a reversionary yield
#  beside them; a typed exit quarter, the exit at the passing rent over an exit yield. Inputs on "Inputs", the timeline on "CF" (quarter 0
#  in column C, dates in row 4), returns on "Summary".
import openpyxl,sys,datetime
from openpyxl.utils import get_column_letter as L
out=sys.argv[1].rstrip('/')
wb=openpyxl.Workbook();S=wb.active;S.title='Summary';I=wb.create_sheet('Inputs');C=wb.create_sheet('CF')
I['A1']='INPUTS (GBP)'
for r,l,v,f in ((3,'Valuation date',datetime.datetime(2026,12,25),'dd-mmm-yy'),(4,'Purchase price',6150000,'#,##0'),(5,'SDLT and fees (% of price)',0.068,'0.00%'),
                (6,'Passing rent (a year)',395000,'#,##0'),(7,'Quarters to the next review',6,'0'),(8,'Review cycle (quarters)',20,'0'),(9,'CPI assumption a year',0.025,'0.00%'),
                (10,'Review collar floor a year',0.01,'0.00%'),(11,'Review collar cap a year',0.03,'0.00%'),(12,'Exit quarter',40,'0'),(13,'Exit yield',0.0625,'0.00%'),
                (14,'Purchaser costs at exit',0.068,'0.00%'),(16,'Loan to value',0.5,'0.00%'),(17,'Swap rate',0.0385,'0.00%'),(18,'Margin',0.0215,'0.00%'),(19,'Arrangement fee',0.01,'0.00%')):
    I[f'A{r}']=l;I[f'B{r}']=v;I[f'B{r}'].number_format=f
I['A21']='Loan';I['B21']='=B4*B16';I['A22']='All-in rate';I['B22']='=B17+B18';I['B21'].number_format='#,##0';I['B22'].number_format='0.00%'
I['A23']='Review uplift (each review)';I['B23']='=MAX((1+B10)^(B8/4),MIN((1+B11)^(B8/4),(1+B9)^(B8/4)))-1';I['B23'].number_format='0.00%'
N=60
for r,l in ((3,'Quarter'),(4,'Quarter date'),(5,'Reviews passed'),(6,'Rent (a year)'),(7,'Rent received'),(9,'Purchase'),(10,'Exit value'),(12,'Loan drawn'),(13,'Interest'),
            (14,'Arrangement fee'),(15,'Loan repaid'),(17,'Property cash flow'),(18,'Equity cash flow')):C[f'A{r}']=l
for k in range(N+1):
    c=L(3+k);live=f'({c}$3<=Inputs!$B$12)'
    C[f'{c}3']=k;C[f'{c}4']=f'=EDATE(Inputs!$B$3,3*{c}3)';C[f'{c}4'].number_format='dd-mmm-yy'
    C[f'{c}5']=f'=IF({c}3<Inputs!$B$7,0,INT(({c}3-Inputs!$B$7)/Inputs!$B$8)+1)'
    C[f'{c}6']=f'=Inputs!$B$6*(1+Inputs!$B$23)^{c}5'
    C[f'{c}7']=f'=IF(AND({c}3>=0,{c}3<Inputs!$B$12),{c}6/4,0)*{live}'   # quarterly in advance: quarter 0 to the quarter before the exit
    C[f'{c}9']=f'=IF({c}3=0,-Inputs!$B$4*(1+Inputs!$B$5),0)'
    C[f'{c}10']=f'=IF({c}3=Inputs!$B$12,{c}6/Inputs!$B$13/(1+Inputs!$B$14),0)'
    C[f'{c}12']=f'=IF({c}3=0,Inputs!$B$21,0)';C[f'{c}13']=f'=IF(AND({c}3>0,{live}),-Inputs!$B$21*Inputs!$B$22/4,0)'
    C[f'{c}14']=f'=IF({c}3=0,-Inputs!$B$21*Inputs!$B$19,0)';C[f'{c}15']=f'=IF({c}3=Inputs!$B$12,-Inputs!$B$21,0)'
    C[f'{c}17']=f'={live}*({c}7+{c}9+{c}10)';C[f'{c}18']=f'={live}*({c}17+{c}12+{c}13+{c}14+{c}15)'
    for r in (6,7,9,10,12,13,14,15,17,18):C[f'{c}{r}'].number_format='#,##0;(#,##0)'
E=L(3+N)
S['A1']='BRANCH INVESTMENT | SUMMARY';S['A3']='Tenant';S['B3']='High-street bank (25-year lease, 17 years unexpired)'
S['A5']='Net initial yield';S['B5']='=Inputs!B6/(Inputs!B4*(1+Inputs!B5))';S['A6']='Reversionary yield';S['B6']="=CF!D6*(1+Inputs!B23)/(Inputs!B4*(1+Inputs!B5))"
S['A8']='Property IRR';S['B8']=f'=XIRR(CF!C17:{E}17,CF!C4:{E}4)';S['A9']='Equity IRR';S['B9']=f'=XIRR(CF!C18:{E}18,CF!C4:{E}4)'
S['A10']='Equity multiple';S['B10']=f'=SUMIF(CF!C18:{E}18,">0")/-SUMIF(CF!C18:{E}18,"<0")';S['A11']='Profit on equity';S['B11']=f'=SUM(CF!C18:{E}18)'
for a in ('B5','B6','B8','B9'):S[a].number_format='0.00%'
S['B10'].number_format='0.00"x"';S['B11'].number_format='#,##0'
wb.save(f'{out}/r48_stnl_branch_gbp.xlsx')

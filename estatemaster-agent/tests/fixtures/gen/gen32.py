# Round 32 fixtures: cash flows to extend by N years. Synthetic.
#  hold: annual, Year 0..10 across columns, a typed capex row, a typed calendar-year row, a hold-period input that drives the sale,
#        a totals column after the timeline, a summary sheet (IRR, NPV, multiple, the exit value read from the last year) and a chart
#  qtr:  quarterly, dated header (EOMONTH), the sale and the loan repayment written in the last quarter only, a cumulative row,
#        XIRR over the dates, a trailing four-quarter average
#  vert: annual down the rows, with a totals row under the timeline
import openpyxl,sys,datetime
from openpyxl.chart import LineChart,Reference
from openpyxl.utils import get_column_letter as L
kind,out=sys.argv[1],sys.argv[2]
wb=openpyxl.Workbook()
if kind=='hold':
    i=wb.active;i.title='Inputs';i['A1']='OAKWOOD RETAIL PARK (USD)'
    for r,(l,v) in enumerate([('Year 1 rent',1000000),('Rent growth',0.03),('Operating costs (share of rent)',0.30),('Purchase price',12000000),('Exit cap rate',0.065),('Hold period (years)',10),('Discount rate',0.08)],2):
        i.cell(r,1,l);i.cell(r,2,v)
    c=wb.create_sheet('Cash Flow');c['A1']='OAKWOOD RETAIL PARK – ANNUAL CASH FLOW (USD)'
    c['A4']='Year';c['A5']='Calendar year';c['N4']='Total'
    for k in range(11):
        col=L(3+k)
        c[f'{col}4']=0 if k==0 else f'={L(2+k)}4+1'
        c[f'{col}5']=2025+k
        if k>=1:
            c[f'{col}7']=f'=IF(AND({col}$4>=1,{col}$4<=Inputs!$B$7),Inputs!$B$2*(1+Inputs!$B$3)^({col}$4-1),0)'
            c[f'{col}8']=f'=-{col}7*Inputs!$B$4'
            c[f'{col}9']=f'={col}7+{col}8'
            c[f'{col}10']=-100000
            c[f'{col}11']=f'=IF({col}$4=Inputs!$B$7,{col}9*(1+Inputs!$B$3)/Inputs!$B$6,0)'
        c[f'{col}13']=f'=SUM({col}9:{col}12)'
    c['C12']='=-Inputs!B5'
    for r,l in [(7,'Rent'),(8,'Operating costs'),(9,'Net operating income'),(10,'Capital expenditure'),(11,'Sale proceeds'),(12,'Purchase'),(13,'Net cash flow')]:
        c.cell(r,1,l);c[f'N{r}']=f'=SUM(C{r}:M{r})'
    s=wb.create_sheet('Summary')
    for r,(l,f) in enumerate([('Unlevered IRR',"=IRR('Cash Flow'!C13:M13)"),('NPV at the discount rate',"=NPV(Inputs!B8,'Cash Flow'!D13:M13)+'Cash Flow'!C13"),
        ('Equity multiple','=SUMIF(\'Cash Flow\'!C13:M13,">0")/-SUMIF(\'Cash Flow\'!C13:M13,"<0")'),('Exit value',"='Cash Flow'!M11"),('Total net operating income',"='Cash Flow'!N9"),('Net profit',"='Cash Flow'!N13")],2):
        s.cell(r,1,l);s.cell(r,2,f)
    ch=LineChart();ch.title='Net operating income';ch.add_data(Reference(c,min_col=4,max_col=13,min_row=9,max_row=9),from_rows=True);s.add_chart(ch,'D2')
elif kind=='qtr':
    i=wb.active;i.title='Inputs'
    for r,(l,v) in enumerate([('Quarterly rent',250000),('Quarterly rent growth',0.005),('Exit cap rate',0.06),('Loan',6000000),('Interest rate',0.05),('Equity',4000000)],2):
        i.cell(r,1,l);i.cell(r,2,v)
    c=wb.create_sheet('CF');c['A3']='Quarter ending';c['C3']=datetime.date(2026,3,31)
    c['A4']='Quarter'
    n=20;last=L(2+n)
    for k in range(n):
        col=L(3+k)
        if k:c[f'{col}3']=f'=EOMONTH({L(2+k)}3,3)'
        c[f'{col}3'].number_format='dd/mm/yyyy'
        c[f'{col}4']=k+1
        c[f'{col}6']=f'=Inputs!$B$2*(1+Inputs!$B$3)^({col}4-1)'
        c[f'{col}7']=f'=-Inputs!$B$5*Inputs!$B$6/4'
        c[f'{col}10']=0
        c[f'{col}11']=f'=SUM({col}6:{col}10)'
        c[f'{col}12']=f'=SUM($C11:{col}11)'
    c[f'{last}8']=f'={last}6*4/Inputs!$B$4'
    c[f'{last}10']='=-Inputs!$B$5'
    c['B11']='=-Inputs!B7';c['B3']=datetime.date(2025,12,31);c['B3'].number_format='dd/mm/yyyy'
    for r,l in [(6,'Rent'),(7,'Interest'),(8,'Sale proceeds'),(10,'Loan repayment'),(11,'Net cash flow to equity'),(12,'Cumulative cash')]:c.cell(r,1,l)
    s=wb.create_sheet('Summary')
    s['A2']='Levered IRR';s['B2']=f'=XIRR(CF!B11:{last}11,CF!B3:{last}3)'
    s['A3']='Net profit';s['B3']=f'=SUM(CF!B11:{last}11)'
    s['A4']='Exit year rent (trailing four quarters)';s['B4']=f'=SUM(CF!{L(n-1)}6:{last}6)'
elif kind=='vert':
    c=wb.active;c.title='Annual'
    c['A1']='CANAL STREET STUDENT HALL (GBP)';c['A3']='Year';c['B3']='Rent';c['C3']='Costs';c['D3']='Net'
    c['F3']='Rent per bed';c['G3']=5200;c['F4']='Beds';c['G4']=300;c['F5']='Cost ratio';c['G5']=0.32;c['F6']='Indexation';c['G6']=0.025;c['F7']='Build cost';c['G7']=9000000
    c['A4']=0;c['D4']='=-G7'
    for k in range(1,9):
        r=4+k;c[f'A{r}']=f'=A{r-1}+1';c[f'B{r}']=f'=$G$3*$G$4*(1+$G$6)^(A{r}-1)';c[f'C{r}']=f'=-B{r}*$G$5';c[f'D{r}']=f'=B{r}+C{r}'
    c['A13']='Total';c['B13']='=SUM(B4:B12)';c['C13']='=SUM(C4:C12)';c['D13']='=SUM(D4:D12)'
    c['A15']='Unlevered IRR';c['B15']='=IRR(D4:D12)'
wb.save(out)

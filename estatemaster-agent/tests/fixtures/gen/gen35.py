# Round 36 fixtures (synthetic): two layouts seen in developers' own models, with made-up figures.
#  r35_dev_monthly_usd: a monthly development cash flow with dated months, XIRR on dates; a Summary whose returns table has PARTNERSHIP
#     RETURNS rows ([Limited Partner Name], [General Partner Name]) above PROPERTY RETURNS rows (Unlevered, Levered) under ROI · EMx · IRR.
#  r35_mixed_partner_usd: a Summary whose rows say "Unlevered Project Level" and "Levered Project Level " (trailing space) under
#     Project Costs · Total Profit · Equity Multiple · IRR, then Partnership Returns LP / GP rows; a quarterly cash flow on dates.
import openpyxl,sys,datetime
from openpyxl.utils import get_column_letter as L
out=sys.argv[1].rstrip('/')
def eom(y,m):
    import calendar
    return datetime.datetime(y,m,calendar.monthrange(y,m)[1])
# ---- 1. monthly development, XIRR on dates ----
wb=openpyxl.Workbook();i=wb.active;i.title='Inputs';i['A1']='HARBOUR VIEW RETAIL (USD)'
rows=[('Land',3000000),('Hard costs (total)',12000000),('Construction months',18),('Stabilised NOI (a year)',2100000),('Exit cap rate',0.065),('Hold (months after completion)',24),
 ('Loan to cost',0.6),('Interest rate (a year)',0.07),('LP share of equity',0.9),('Preferred return',0.08),('GP promote above the pref',0.2)]
for r,(l,v) in enumerate(rows,2):i.cell(r,1,l);i.cell(r,2,v)
for r in (6,8,9,10,11,12):i.cell(r,2).number_format='0.00%'
i['C4']='=ROUND(B4,0)';i['C7']='=ROUND(B7,0)'   # month counts are whole months where the timeline reads them
u=wb.create_sheet('Underwriting');N=1+18+24+1   # month 0 .. exit month
u['A3']='Month';u['A4']='Month ending'
lab={6:'Land',7:'Hard costs',8:'NOI',9:'Sale proceeds',10:'Unlevered cash flow',11:'Loan draw',12:'Interest',13:'Loan repayment',14:'Levered cash flow',15:'Loan balance',
 17:'LP share of levered cash flow',18:'GP share of levered cash flow'}
for r,l in lab.items():u.cell(r,1,l)
for k in range(N):
    c=L(2+k);p=L(1+k);y,m=divmod(k,12);u[f'{c}3']=k;u[f'{c}4']=eom(2026+y,1+m);u[f'{c}4'].number_format='mmm-yy'
    u[f'{c}6']=f'=IF({c}$3=0,-Inputs!$B$2,0)'
    u[f'{c}7']=f'=IF(AND({c}$3>=1,{c}$3<=Inputs!$C$4),-Inputs!$B$3/Inputs!$C$4,0)'
    u[f'{c}8']=f'=IF(AND({c}$3>Inputs!$C$4,{c}$3<=Inputs!$C$4+Inputs!$C$7),Inputs!$B$5/12,0)'
    u[f'{c}9']=f'=IF({c}$3=Inputs!$C$4+Inputs!$C$7+1,Inputs!$B$5/Inputs!$B$6,0)'
    u[f'{c}10']=f'=SUM({c}6:{c}9)'
    u[f'{c}11']=f'=-({c}6+{c}7)*Inputs!$B$8'
    u[f'{c}12']='=0' if k==0 else f'=-{p}15*Inputs!$B$9/12'
    u[f'{c}13']=f'=IF({c}$3=Inputs!$C$4+Inputs!$C$7+1,-({p}15+{c}11),0)' if k else '=0'
    u[f'{c}14']=f'={c}10+{c}11+{c}12+{c}13'
    u[f'{c}15']=f'={c}11+{c}13' if k==0 else f'={p}15+{c}11+{c}13'
    ex=f'Inputs!$C$4+Inputs!$C$7+1';prom=f'IF({c}$3={ex},Inputs!$B$12*MAX(0,SUM($B$14:${L(1+N)}$14))*Inputs!$B$10,0)'   # the GP's promote, paid by the LPs at exit
    u[f'{c}17']=f'={c}14*Inputs!$B$10-{prom}';u[f'{c}18']=f'={c}14*(1-Inputs!$B$10)+{prom}'
last=L(1+N);R=lambda r:f'Underwriting!$B${r}:${last}${r}';D=f'Underwriting!$B$4:${last}$4'
s=wb.create_sheet('Summary',0);s['B2']='KEY RETURN METRICS'
s['N20']='PARTNERSHIP RETURNS';s['Q20']='ROI';s['R20']='EMx ';s['S20']='IRR'
s['N21']='[Limited Partner Name]';s['Q21']=f'=SUM({R(17)})/-SUMIF({R(17)},"<0")';s['R21']='=Q21+1';s['S21']=f'=XIRR({R(17)},{D})'
s['N22']='[General Partner Name]';s['Q22']=f'=SUM({R(18)})/-SUMIF({R(18)},"<0")';s['R22']='=Q22+1';s['S22']=f'=XIRR({R(18)},{D})'
s['N24']='PROPERTY RETURNS';s['Q24']='ROI';s['R24']='EMx ';s['S24']='IRR'
s['N25']='Unlevered';s['Q25']=f'=SUM({R(10)})/-SUMIF({R(10)},"<0")';s['R25']='=Q25+1';s['S25']=f'=XIRR({R(10)},{D})'
s['N26']='Levered';s['Q26']=f'=SUM({R(14)})/-SUMIF({R(14)},"<0")';s['R26']='=Q26+1';s['S26']=f'=XIRR({R(14)},{D})'
for r in (21,22,25,26):s[f'Q{r}'].number_format='0.00%';s[f'R{r}'].number_format='0.00"x"';s[f'S{r}'].number_format='0.00%'
s['B30']='Net Profit';s['C30']=f'=SUM({R(14)})';s['B31']='Total Uses';s['C31']=f'=-SUM({R(6)},{R(7)})'
wb.save(f'{out}/r35_dev_monthly_usd.xlsx')
# ---- 2. mixed use: "Levered Project Level" rows and a partnership table ----
wb=openpyxl.Workbook();i=wb.active;i.title='Inputs';i['A1']='THE WILLOWS CONDOS AND RETAIL (USD)'
rows=[('Land and acquisition',6000000),('Construction cost',30000000),('Condo sales (total)',38000000),('Retail exit value',14000000),('Loan to cost',0.65),('Interest rate (a year)',0.075),('LP share',0.9)]
for r,(l,v) in enumerate(rows,2):i.cell(r,1,l);i.cell(r,2,v)
for r in (6,7,8):i.cell(r,2).number_format='0.00%'
c=wb.create_sheet('CF');Q=14;c['A3']='Quarter ending';c['A4']='Quarter'
lab={6:'Acquisition',7:'Construction',8:'Condo sales',9:'Retail sale',10:'Unlevered cash flow',11:'Loan draw',12:'Interest',13:'Repayment',14:'Levered cash flow',15:'Loan balance',17:'LP cash flow',18:'GP cash flow'}
for r,l in lab.items():c.cell(r,1,l)
for k in range(Q):
    col=L(2+k);p=L(1+k);y,m=divmod(3*k+2,12);c[f'{col}4']=k;c[f'{col}3']=eom(2026+y,1+m);c[f'{col}3'].number_format='mmm-yy'
    c[f'{col}6']=f'=IF({col}$4=0,-Inputs!$B$2,0)'
    c[f'{col}7']=f'=IF(AND({col}$4>=1,{col}$4<=8),-Inputs!$B$3/8,0)'
    c[f'{col}8']=f'=IF(AND({col}$4>=9,{col}$4<=12),Inputs!$B$4/4,0)'
    c[f'{col}9']=f'=IF({col}$4=13,Inputs!$B$5,0)'
    c[f'{col}10']=f'=SUM({col}6:{col}9)'
    c[f'{col}11']=f'=-({col}6+{col}7)*Inputs!$B$6'
    c[f'{col}12']='=0' if k==0 else f'=-{p}15*Inputs!$B$7/4'
    c[f'{col}13']='=0' if k==0 else f'=-MIN({p}15+{col}11,MAX(0,{col}8+{col}9))'
    c[f'{col}14']=f'={col}10+{col}11+{col}12+{col}13'
    c[f'{col}15']=f'={col}11+{col}13' if k==0 else f'={p}15+{col}11+{col}13'
    prom=f'IF({col}$4=13,0.2*MAX(0,SUM($B$14:${L(1+Q)}$14))*Inputs!$B$8,0)'   # the GP's promote, paid by the LPs at the last sale
    c[f'{col}17']=f'={col}14*Inputs!$B$8-{prom}';c[f'{col}18']=f'={col}14*(1-Inputs!$B$8)+{prom}'
last=L(1+Q);R=lambda r:f'CF!$B${r}:${last}${r}';D=f'CF!$B$3:${last}$3'
s=wb.create_sheet('Summary',0);s['B5']='Summary';s['B7']='General Info';s['E7']='Returns'
s['F8']='Project Costs';s['G8']='Total Profit';s['H8']='Equity Multiple';s['I8']='IRR'
s['B8']='Project Name';s['C8']='The Willows Condos and Retail'
s['E9']='Unlevered Project Level';s['F9']=f'=-SUMIF({R(10)},"<0")';s['G9']=f'=SUM({R(10)})';s['H9']='=(F9+G9)/F9';s['I9']=f'=XIRR({R(10)},{D})'
s['E10']='Levered Project Level ';s['F10']=f'=-SUMIF({R(14)},"<0")';s['G10']=f'=SUM({R(14)})';s['H10']='=(F10+G10)/F10';s['I10']=f'=XIRR({R(14)},{D})'
s['E11']='Partnership Returns'
s['E12']='LP';s['F12']=f'=-SUMIF({R(17)},"<0")';s['G12']=f'=SUM({R(17)})';s['H12']='=(F12+G12)/F12';s['I12']=f'=XIRR({R(17)},{D})'
s['E13']='GP';s['F13']=f'=-SUMIF({R(18)},"<0")';s['G13']=f'=SUM({R(18)})';s['H13']='=(F13+G13)/F13';s['I13']=f'=XIRR({R(18)},{D})'
for r in (9,10,12,13):s[f'I{r}'].number_format='0.00%';s[f'H{r}'].number_format='0.00"x"';s[f'F{r}'].number_format='#,##0';s[f'G{r}'].number_format='#,##0'
wb.save(f'{out}/r35_mixed_partner_usd.xlsx')

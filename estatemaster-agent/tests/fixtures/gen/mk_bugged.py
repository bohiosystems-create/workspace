import openpyxl,subprocess,os,shutil,sys,warnings
warnings.filterwarnings('ignore')
src='/home/user/workspace/estatemaster-agent/tests/fixtures/models/resi_uk.xlsx'
wb=openpyxl.load_workbook(src)
C=wb['CashFlow'];A=wb['Assumptions'];K=wb['Checks']
C['M6']=-1400000                 # planted 1: a typed number inside the build-cost formula row
C['P9']='=SUM(P5:P7)'            # planted 2: one month's net cash flow skips the sales line
A['B22']='Marketing budget';A['D22']=500000;A['D22'].number_format='£#,##0'   # planted 3: an input nothing uses
K['B15']='Cost per unit sold';K['D15']='=Returns!D5/0'                      # planted 4: a division by zero
d=os.path.dirname(os.path.abspath(__file__))+'/bug_src';os.makedirs(d,exist_ok=True);p=d+'/resi_bugged.xlsx';wb.save(p)
o=d+'/out';shutil.rmtree(o,ignore_errors=True);os.makedirs(o)
subprocess.run(['soffice','--headless','--calc','--convert-to','xlsx:Calc MS Excel 2007 XML','--outdir',o,p],check=True,capture_output=True)
shutil.copy(o+'/resi_bugged.xlsx',sys.argv[1]);print('written')

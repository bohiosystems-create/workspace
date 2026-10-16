# a third model: US office pro forma in $000s (outputs in thousands, percentages typed as whole numbers), one sheet, outputs above inputs
import openpyxl, subprocess, sys, os, shutil
from openpyxl.styles import Font
wb=openpyxl.Workbook();S=wb.active;S.title="Pro Forma"
S["B1"]="MAIN STREET OFFICE · pro forma ($000s)";S["B1"].font=Font(bold=True)
S["B3"]="Returns Summary ($000s)";S["B3"].font=Font(bold=True)
S["B4"]="Total Project Cost";S["C4"]="=C12+C13*C14/1000+C15";S["C4"].number_format='"$"#,##0'
S["B5"]="Gross Revenue";S["C5"]="=C16*C17/1000";S["C5"].number_format='"$"#,##0'
S["B6"]="Net Profit";S["C6"]="=C5-C4";S["C6"].number_format='"$"#,##0'
S["B7"]="Profit on Cost (%)";S["C7"]="=C6/C4*100";S["C7"].number_format='0.0'
S["B8"]="Levered IRR (%)";S["C8"]="=(C7/100)/(C18/12)*100*(1-C19/100)";S["C8"].number_format='0.0'
S["B10"]="Inputs";S["B10"].font=Font(bold=True)
rows=[("Land ($000s)",12000,'"$"#,##0'),("Hard cost ($/sf)",320,'"$"#,##0'),("Rentable area (sf)",150000,'#,##0'),("Soft costs ($000s)",9500,'"$"#,##0'),("Sale price ($/sf)",680,'"$"#,##0'),("Sellable area (sf)",148000,'#,##0'),("Hold (months)",30,'0'),("Loan to cost (%)",60,'0.0')]
r=12
for lab,v,fmt in rows:
    S.cell(r,2,lab);c=S.cell(r,3,v);c.number_format=fmt;r+=1
tmp=__import__("tempfile").mkdtemp();os.makedirs(tmp,exist_ok=True);src=tmp+"/office_k.xlsx";wb.save(src)
out=tmp+"/out";shutil.rmtree(out,ignore_errors=True);os.makedirs(out)
subprocess.run(["soffice","--headless","--calc","--convert-to","xlsx:Calc MS Excel 2007 XML","--outdir",out,src],check=True,capture_output=True)
shutil.copy(out+"/office_k.xlsx",sys.argv[1]);print("written")

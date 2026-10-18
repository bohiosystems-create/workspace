# Round 30 fixture: a small office development where costs are written as rate × quantity inside formulas
# (Construction Costs =Units*190, Closing Costs =Land*0.03), a four-tenant rent roll, an annual cash flow and XIRR-free IRR.
import openpyxl,sys
from openpyxl.workbook.defined_name import DefinedName
out=sys.argv[1]
wb=openpyxl.Workbook();u=wb.active;u.title='Underwriting'
u['A1']='HARBOR POINT OFFICE – DEVELOPMENT (USD)'
rows=[('Rentable area (SF)',37500),('Land Costs',1600000),('Closing Costs','=B4*0.03'),('Construction Costs','=Units*190'),('Other Hard Costs','=B6*0.015'),
      ('Architecture & Engineering','=(B6+B7)*0.06'),('Total Project Cost','=SUM(B4:B8)'),('Exit cap rate',0.075),('Operating expenses (share of rent)',0.35)]
for i,(l,v) in enumerate(rows,3):u.cell(i,1,l);u.cell(i,2,v)
wb.defined_names['Units']=DefinedName('Units',attr_text='Underwriting!$B$3')
u['A13']='RENT ROLL';u['A14']='Tenant';u['B14']='Area (SF)';u['C14']='Rent / SF / yr';u['D14']='Annual rent'
for i,(t,a,r) in enumerate([('Swain and Jones',25000,34),('CBLL Realty',5000,32),('Legal Eagles',5000,34),('Speculative tenant',2500,32)],15):
    u.cell(i,1,t);u.cell(i,2,a);u.cell(i,3,r);u.cell(i,4,f'=B{i}*C{i}')
u['A19']='Total rent';u['D19']='=SUM(D15:D18)'
u['A22']='CASH FLOW';u['A23']='Year'
for y in range(6):u.cell(23,2+y,y)
u['A24']='Development cost';u['B24']='=-B9*0.4';u['C24']='=-B9*0.6'
u['A25']='Net operating income'
for y in range(2,6):c=openpyxl.utils.get_column_letter(2+y);u[f'{c}25']=f'=$D$19*(1-$B$11)*(1.03^({c}23-2))'
u['A26']='Sale proceeds';u['F26']='=F25*1.03/B10*0.98'
u['A27']='Net unlevered cash flow'
for y in range(6):c=openpyxl.utils.get_column_letter(2+y);u[f'{c}27']=f'=SUM({c}24:{c}26)'
u['A29']='Unlevered IRR';u['B29']='=IRR(B27:G27)'
u['A30']='Net profit';u['B30']='=SUM(B27:G27)'
u['A31']='Total development cost';u['B31']='=B9'
u['A32']='Profit on cost';u['B32']='=B30/B31'
wb.save(out)

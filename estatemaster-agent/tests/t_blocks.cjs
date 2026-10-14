// Side-by-side EstateMaster blocks and a sheet starting at B2: each label gets its own value and unit, cells addressed from A1.
const X=require(__dirname+'/fixtures/package/dist/xlsx.full.min.js');const EM=require(__dirname+'/../api/_lib/emcheck.js');
const inp=X.utils.aoa_to_sheet([[],[null,'Start Month','Oct-26',null,'Land Price',20000000,'AUD'],[null,'Model Size',165,'Months','Days per Month',30,null],[null,'Land Price (store)',1000000,'AUD','Units / Month',null,null],[null,'Cash Flow Title','Build to Hold Industrial'],[null,'Add GST on Land Price?','Y','Interest Rate','6.50%','p.a.'],[null,'VAT',0.15,'%']]);
inp['!ref']='B2:G7';
const sum=X.utils.aoa_to_sheet([['Equity IRR (geared)',0.1232,'Project IRR (ungeared)',0.0963],['Development Margin',0.08,'Gross Rent',1.09],['Net Development Profit',40000000,'Land Area',95144755],['Total Development Cost',500000000],['Gross Sales Revenue',540000000],['Peak Debt',300000000]]);
const wb=X.utils.book_new();X.utils.book_append_sheet(wb,sum,'Summary');X.utils.book_append_sheet(wb,inp,'Input');
const r=EM.parseWorkbook(wb,X,'t.xlsx'),I=Object.fromEntries(r.inputs.map(i=>[i.label,i]));let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
ok(I['Start Month']&&I['Start Month'].value==null&&/Oct-26/.test(I['Start Month'].text),'Start Month keeps its own date, not the land price: '+JSON.stringify(I['Start Month']));
ok(I['Land Price']&&I['Land Price'].value===20000000&&I['Land Price'].unit==='USD'&&I['Land Price'].cell==='Input!F2','Land Price from its own block, cell F2: '+JSON.stringify(I['Land Price']&&[I['Land Price'].value,I['Land Price'].unit,I['Land Price'].cell]));
ok(I['Model Size']&&I['Model Size'].value===165&&I['Model Size'].unit==='Months','Model Size 165 Months (not "Days per Month")');
ok(I['Days per Month']&&I['Days per Month'].value===30,'second block on the row read too');
ok(I['Land Price (store)']&&I['Land Price (store)'].unit==='USD','Land Price (store) unit is its own');
ok(I['Cash Flow Title']&&I['Cash Flow Title'].text==='Build to Hold Industrial','title read as a text input');
ok(I['Interest Rate']&&I['Interest Rate'].value===6.5&&I['Interest Rate'].pct,'Interest Rate 6.5% from the second block');
ok(I['VAT']&&Math.abs(I['VAT'].value-0.15)<1e-9,'a three-letter label (VAT) is still a label');
ok(r.out.levered_irr===12.32&&r.out.unlevered_irr===9.63,'IRRs: '+r.out.levered_irr+' / '+r.out.unlevered_irr);
ok(r.out.profit_on_cost===8,'profit on cost from its own block (not the 1.09 next to it): '+r.out.profit_on_cost);
ok(r.out.net_profit===40000000&&r.cells.net_profit==='Summary!B3','net profit not taken from the neighbouring block, cell B3');
console.log(`${pass} pass, ${fail} fail`);

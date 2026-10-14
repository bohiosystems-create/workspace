// Writes an EstateMaster-style export (Summary, Input, Cash Flow sheet with monthly dates) from the reference model, plus the ground truth for changes.
const X=require('../package/dist/xlsx.full.min.js'),{model}=require('./refmodel.cjs'),fs=require('fs');
const P={land:90e6,cons:420e6,gdv:760e6,consStart:3,consM:28,rate:8,equity:180e6};const b=model(P);
const start=Date.UTC(2026,0,1),ser=m=>{const d=new Date(start);d.setUTCMonth(d.getUTCMonth()+m);return Math.round(d.getTime()/864e5)+25569};
const cols=b.T,hdr=['Line','Total',...Array.from({length:cols},(_,m)=>ser(m))];
const row=(lab,arr)=>[lab,arr.reduce((a,c)=>a+c,0),...arr.map(v=>Math.round(v*100)/100)];
const CF=[['ARGUS EstateMaster DF · Cash Flow (monthly)'],[],hdr,['REVENUE'],row('Sales Deposits',b.L.dep),row('Sales Settlements',b.L.settle),row('Total Revenue',b.L.dep.map((v,t)=>v+b.L.settle[t])),['COSTS'],row('Land Purchase Price',b.L.land),row('Construction Costs',b.L.cons),row('Professional Fees',b.L.fees),row('Contingency',b.L.cont),row('Selling Costs (Agents)',b.L.sell),row('Total Costs',b.L.land.map((v,t)=>v+b.L.cons[t]+b.L.fees[t]+b.L.cont[t]+b.L.sell[t])),[],row('Net Cash Flow before Funding',b.u),[],['FUNDING'],row('Equity Contribution',b.eqIn),row('Loan 1 Drawdown',b.draw),row('Loan 1 Interest (capitalised)',b.intA),row('Loan 1 Repayment',b.rep),[],row('Net Cash Flow to Equity',b.eq)];
const wb=X.utils.book_new();
X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['Cash Flow Title','Reference Tower'],['Project IRR (ungeared)',b.uirr/100],['Equity IRR (geared)',b.lirr/100],['Development Margin (on cost)',b.poc/100],['Net Development Profit',b.np],['Total Development Cost',b.tc],['Gross Sales Revenue',b.rev],['Peak Debt',b.peak]]),'Summary');
X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['INPUTS'],['Land Purchase Price',P.land,'SAR'],['Construction Cost',P.cons,'SAR'],['Gross Sales Value',P.gdv,'SAR'],['Loan 1 interest rate',P.rate/100,'% p.a.'],['Equity',P.equity,'SAR'],['Construction period',P.consM,'months']]),'Input');
const ws=X.utils.aoa_to_sheet(CF);for(let c=2;c<hdr.length;c++){const a=X.utils.encode_cell({r:2,c});ws[a].t='n';ws[a].z='mmm-yy'}X.utils.book_append_sheet(wb,ws,'Cash Flow');
fs.writeFileSync(__dirname+'/ref_export.xlsx',X.write(wb,{type:'buffer',bookType:'xlsx'}));
const S={base:{},price10:{price:-10},cost15:{cost:15},land10:{land:10},delay6:{delay:6},rate2:{rate:2},combo:{price:-5,cost:10,delay:3}};const truth={};
for(const [k,d] of Object.entries(S)){const r=model(P,d);truth[k]={d,lirr:r.lirr,uirr:r.uirr,np:r.np,poc:r.poc,tc:r.tc,peak:r.peak}}
fs.writeFileSync(__dirname+'/truth.json',JSON.stringify(truth,null,1));console.log(JSON.stringify(truth,null,0).slice(0,900));

// Build-to-hold reference: construction, rent with operating costs (% of rent), exit sale at NOI ÷ cap rate, equity first then capitalised debt.
const X=require('../package/dist/xlsx.full.min.js'),fs=require('fs');
function irrP(fl){const f=r=>fl.reduce((s,c,t)=>s+c/Math.pow(1+r,t),0);let lo=-0.99,hi=1,flo=f(lo);if(flo*f(hi)>0)return NaN;for(let i=0;i<300;i++){const m=(lo+hi)/2,fm=f(m);if(flo*fm<=0)hi=m;else{lo=m;flo=fm}}return(lo+hi)/2}
const ann=r=>(Math.pow(1+r,12)-1)*100;
function m(ch={}){const T=84,z=()=>Array(T).fill(0),L={land:z(),cons:z(),fees:z(),rent:z(),opex:z(),exit:z()};const rent=48e6*(1+(ch.rent||0)/100),cap=7+(ch.cap||0),cons=300e6*(1+(ch.cost||0)/100),rate=(8+(ch.rate||0))/100/12;
  L.land[0]=60e6;for(let k=0;k<24;k++){const v=cons*Math.sin(Math.PI*(k+0.5)/24)/(24*2/Math.PI);L.cons[2+k]=v;L.fees[2+k]=v*0.08}
  const s=26,dl=ch.delay||0;for(let k=s+dl;k<s+dl+36;k++){L.rent[k]=rent/12;L.opex[k]=rent/12*0.15}L.exit[s+dl+36]=rent*0.85/(cap/100);
  const u=Array.from({length:T},(_,t)=>L.rent[t]+L.exit[t]-L.opex[t]-L.land[t]-L.cons[t]-L.fees[t]);let used=0,bal=0,int=0;const eq=z(),eqIn=z();
  for(let t=0;t<T;t++){const i=bal*rate;bal+=i;int+=i;const cf=u[t];if(cf<0){let need=-cf;const e=Math.min(need,Math.max(0,140e6-used));used+=e;need-=e;eqIn[t]=e;bal+=need;eq[t]=-e}else{const r=Math.min(bal,cf);bal-=r;eq[t]=cf-r}}if(bal>1)eq[T-1]-=bal;
  return{L,u,eq,eqIn,T,lirr:ann(irrP(eq)),uirr:ann(irrP(u)),int}}
const b=m(),hdr=['Line','Total',...Array.from({length:b.T},(_,k)=>Math.round(Date.UTC(2026,k,1)/864e5)+25569)],row=(l,a)=>[l,a.reduce((x,c)=>x+c,0),...a.map(v=>Math.round(v*100)/100)];
const CF=[['Cash Flow'],[],hdr,row('Rental Income',b.L.rent),row('Sale of Investment (Exit)',b.L.exit),row('Operating Expenses',b.L.opex),row('Land Purchase Price',b.L.land),row('Construction Costs',b.L.cons),row('Professional Fees',b.L.fees),row('Net Cash Flow before Funding',b.u),row('Equity Contribution',b.eqIn),row('Net Cash Flow to Equity',b.eq)];
const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['Cash Flow Title','Hold Tower'],['Project IRR (ungeared)',b.uirr/100],['Equity IRR (geared)',b.lirr/100]]),'Summary');X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['INPUTS'],['Capitalisation Rate',0.07,'%']]),'Input');X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(CF),'Cash Flow');
fs.writeFileSync(__dirname+'/hold_export.xlsx',X.write(wb,{type:'buffer',bookType:'xlsx'}));
const S={rent20:{rent:-20},cap1:{cap:1},cost10:{cost:10},combo:{rent:-10,cap:0.5,cost:5}},T={};for(const [k,d] of Object.entries(S)){const r=m(d);T[k]={d,lirr:r.lirr,uirr:r.uirr}}fs.writeFileSync(__dirname+'/hold_truth.json',JSON.stringify(T));console.log('base',b.lirr.toFixed(3),b.uirr.toFixed(3),JSON.stringify(T).slice(0,300));

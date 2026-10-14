// Independent reference development model (monthly), used only to produce test workbooks and the ground truth.
// Land at m0, construction S-curve, fees and contingency as % of construction, 10% deposits during construction, 90% settlements after completion,
// selling costs 3% of each sale, equity first up to a set amount, then a capitalised-interest loan repaid from net sales, surplus to equity.
function irrM(fl){const f=r=>fl.reduce((s,c,t)=>s+c/Math.pow(1+r,t),0);let lo=-0.99,hi=1;let flo=f(lo),fhi=f(hi);if(flo*fhi>0)return NaN;for(let i=0;i<300;i++){const m=(lo+hi)/2,fm=f(m);if(flo*fm<=0){hi=m}else{lo=m;flo=fm}}return (lo+hi)/2}
const ann=r=>(Math.pow(1+r,12)-1)*100;
function model(P,ch={}){const T=60,z=()=>Array(T).fill(0);const L={land:z(),cons:z(),fees:z(),cont:z(),dep:z(),settle:z(),sell:z()};
  const price=P.gdv*(1+(ch.price||0)/100),cons=P.cons*(1+(ch.cost||0)/100),land=P.land*(1+(ch.land||0)/100),dl=ch.delay||0,rate=(P.rate+(ch.rate||0))/100/12;
  L.land[0]=land;const cw=[];for(let m=0;m<P.consM;m++){const x=(m+0.5)/P.consM;cw.push(Math.sin(Math.PI*x))}const sw=cw.reduce((a,b)=>a+b,0);
  for(let m=0;m<P.consM;m++){const v=cons*cw[m]/sw;L.cons[P.consStart+m]=v;L.fees[P.consStart+m]=v*0.10;L.cont[P.consStart+m]=v*0.05}
  const depM=12;for(let m=0;m<depM;m++){L.dep[6+m+dl]+=price*0.10/depM}const done=P.consStart+P.consM;for(let m=0;m<6;m++){L.settle[done+m+dl]+=price*0.90/6}
  for(let t=0;t<T;t++)L.sell[t]=(L.dep[t]+L.settle[t])*0.03;
  const u=Array.from({length:T},(_,t)=>L.dep[t]+L.settle[t]-L.sell[t]-L.land[t]-L.cons[t]-L.fees[t]-L.cont[t]);
  let eqUsed=0,bal=0,peak=0,int=0;const eq=z(),draw=z(),rep=z(),intA=z(),eqIn=z();
  for(let t=0;t<T;t++){const i=bal*rate;bal+=i;int+=i;intA[t]=i;let cf=u[t];
    if(cf<0){let need=-cf;const e=Math.min(need,Math.max(0,P.equity-eqUsed));eqUsed+=e;need-=e;eqIn[t]=e;bal+=need;draw[t]=need;eq[t]=-e}
    else{const r=Math.min(bal,cf);bal-=r;rep[t]=r;eq[t]=cf-r}
    if(bal>peak)peak=bal}
  if(bal>1)eq[T-1]-=bal;
  const rev=L.dep.reduce((a,b)=>a+b,0)+L.settle.reduce((a,b)=>a+b,0),sell=L.sell.reduce((a,b)=>a+b,0),costs=['land','cons','fees','cont'].reduce((s,k)=>s+L[k].reduce((a,b)=>a+b,0),0);
  const tc=costs+int,np=rev-sell-tc;return{L,u,eq,draw,rep,intA,eqIn,T,lirr:ann(irrM(eq)),uirr:ann(irrM(u)),np,tc,rev,poc:np/tc*100,peak,int}}
module.exports={model,irrM,ann};

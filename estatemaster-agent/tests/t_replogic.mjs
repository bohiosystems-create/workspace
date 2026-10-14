// The agent's replica and fund waterfall make financial sense: directions, financing independence, identities, waterfall splits.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
const r=await p.evaluate(()=>{const b0=run({}),R={};const d=x=>run(x);
  R.price=d({price:10}).irr>b0.irr&&d({price:-10}).irr<b0.irr;R.cost=d({cost:10}).irr<b0.irr;R.land=d({land:10}).irr<b0.irr;R.rent=d({rent:-10}).irr<b0.irr;R.cap=d({cap:1}).irr<b0.irr;R.delay=d({delay:6}).irr<b0.irr&&d({delay:12}).irr<d({delay:6}).irr;R.area=d({area:-10}).profit<b0.profit;
  const rr=d({rate:2});R.rateLev=rr.irr<b0.irr;R.rateUnlev=Math.abs(rr.uirr-b0.uirr)<1e-9;R.ltcUnlev=Math.abs(d({ltc:10}).uirr-b0.uirr)<1e-9;
  R.identity=Math.abs(b0.rev-b0.tc-b0.profit)<1;R.poc=Math.abs(b0.profit/b0.tc-b0.poc)<1e-12;R.peak=b0.peak<=b0.tc&&b0.peak>0;
  R.lev=b0.irr>b0.uirr;   // positive leverage at a finance rate below the project return
  const w=waterfall(b0);R.wf={lp:w.lpIrr,gp:w.gpIrr,pr:w.promo};R.wfLpBelow=w.lpIrr<b0.irr;R.wfGpAbove=w.gpIrr>w.lpIrr;
  const w2=waterfall(b0,{...FT,promote:FT.promote+10});R.promote=w2.lpIrr<w.lpIrr&&w2.gpIrr>w.gpIrr;const w3=waterfall(b0,{...FT,fee:FT.fee+1});R.fee=w3.lpIrr<w.lpIrr;
  const cash=b0.cf.eq.reduce((a,c)=>a+c,0),split=w.L.reduce((a,c)=>a+c,0)+w.G.reduce((a,c)=>a+c,0)+w.fees;R.wfCash=Math.abs(cash-split)/Math.abs(cash)<1e-6;R.cash=[cash,split];
  return R});
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(r.price&&r.cost&&r.land&&r.rent&&r.cap&&r.delay&&r.area,'every driver moves the returns the right way (price, cost, land, rent, cap rate, delay, area)');
t(r.rateLev&&r.rateUnlev,'a higher interest rate lowers the levered IRR and leaves the project IRR unchanged');t(r.ltcUnlev,'leverage does not change the project IRR');
t(r.identity&&r.poc,'revenue − cost = profit; profit on cost = profit ÷ cost');t(r.peak,'peak debt is positive and below total cost');t(r.lev,'positive leverage at the base');
t(r.wfLpBelow&&r.wfGpAbove,'fund waterfall: LP below the project equity IRR, GP above the LP (promote) '+JSON.stringify(r.wf));t(r.promote,'a higher promote moves return from LP to GP');t(r.fee,'a higher fee lowers the LP IRR');
t(r.wfCash,'the waterfall distributes exactly the equity cash (LP + GP + fees = equity flows) '+JSON.stringify(r.cash));
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_replogic:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();

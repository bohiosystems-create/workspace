// What-if parsing: every common phrasing turns into the right shock (direction and size) for the replica.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
const cases=[['Sale price: from SAR 13,500/sqm to SAR 12,150/sqm (−10%, lower)',{price:-10}],['what if sale price goes from 13,500 to 12,150',{price:-10}],['sale price −10%',{price:-10}],['construction cost from 5,200 to 5,616 SAR/sqm',{cost:8}],['interest rate from 8.5% to 9%',{rate:0.5}],['delay of 3 months',{delay:3}],['cap rate up 50 bps',{cap:0.5}],['land cost 90M to 103.5M',{land:15}],['sale price down to 12,150',{price:-10}],
  ['sale price +5% and construction cost −3%',{price:5,cost:-3}],['interest rate up 100 bps',{rate:1}],['construction cost rises 15%',{cost:15}],['a 12 month delay',{delay:12}],['price drops 10%',{price:-10}],['retail rent falls 20%',{rent:-20}],['Leverage (LTC): from 55% to 50%',{ltc:-5}]];
const r=await p.evaluate(cs=>cs.map(([t])=>parseMods(t)),cases);let pass=0,fail=0;
cases.forEach(([t,exp],i)=>{const got=r[i],good=Object.keys(exp).every(k=>Math.abs((got[k]??NaN)-exp[k])<0.05)&&Object.keys(got).every(k=>k in exp);good?pass++:fail++;console.log((good?'PASS':'FAIL')+' | '+t+' → '+JSON.stringify(got))});
if(errs.length){fail++;console.log('FAIL | page errors '+errs.join('; '))}console.log(`t_parsemods: ${pass} pass, ${fail} fail`);await b.close();

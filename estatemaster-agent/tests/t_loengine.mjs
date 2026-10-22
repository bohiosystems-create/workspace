// The second engine (LibreOffice on the server, lo-service/): a workbook the browser engine cannot reproduce (FREQUENCY) is checked by
// the server engine against Excel's stored results, then its figures and what-ifs come from there, the answer says so, and a tool that
// would read figures another way says "not computed". Needs a running service: LO_TEST_URL=http://localhost:8099 (token "test").
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';const LOU=process.env.LO_TEST_URL;
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+JSON.stringify(d).slice(0,300):''))}};
if(!LOU){console.log('PASS | skipped: no server engine to test against (set LO_TEST_URL)');console.log('1 pass, 0 fail');process.exit(0)}
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),ctx=await b.newContext(),p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await ctx.route('**/api/lo',async route=>{const rq=route.request();if(rq.method()==='GET'){const r=await fetch(LOU+'/health');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:r.ok,...(await r.json())})})}
  const r=await fetch(LOU+'/recalc',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test'},body:rq.postData()});route.fulfill({status:r.status,contentType:'application/json',body:await r.text()})});
await p.goto(base);await p.waitForTimeout(2500);
const r=await p.evaluate(async bytes=>{const buf=new Uint8Array(bytes).buffer;xcRaw=async()=>buf;const info=await xcEngine({id:'LF',src:'file',cells:{}});
  const reads=['Leases!F2','Leases!F3','Leases!I4','Leases!I5','Leases!I6'];const v0=await xcQ(()=>xcCall({op:'get',refs:reads}));
  const [v1]=await xcQ(()=>xcCall({op:'run',runs:[[['Leases!B3',2026]]],read:reads,reset:true}));const fm=await xcQ(()=>xcCall({op:'fmt',refs:['Leases!I5']})).catch(e=>'ERR '+e.message);
  let series='';try{await xcQ(()=>xcCall({op:'series',refs:['Leases!I6']}))}catch(e){series=e.message}
  return{ok:info.ok,engine:info.engine,pct:info.pct,browser:info.browser,v0,v1,fm,series}},[...fs.readFileSync(F+'lease_freq.xlsx')]);
ok(r.ok&&r.engine==='server'&&r.pct>=99,'the browser engine has no FREQUENCY; the server engine reproduces Excel\'s stored results and takes the workbook',r);
ok((r.browser&&r.browser.unsup||[]).includes('FREQUENCY'),'what the browser engine lacks is kept for the answer to say',r.browser);
ok(JSON.stringify(r.v0)===JSON.stringify([3,3,3,0.6,r.v0[4]])&&Math.abs(r.v0[4]-10300*1.03**5)<1e-6,'the figures read from the server engine are Excel\'s',r.v0);
ok(r.v1[0]===4&&r.v1[1]===2&&Math.abs(r.v1[3]-0.6)<1e-12,'a what-if (a lease expiring two years earlier) is recalculated exactly by the server engine: 4 leases by 2027',r.v1);
ok(typeof r.fm!=='string'||!/^ERR/.test(r.fm),'the browser engine still answers the structure (number formats)',r.fm);
ok(/not computed/.test(r.series),'a tool that would read figures another way says “not computed” on this workbook',r.series);
ok(!errs.length,'no page errors',errs);
console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);

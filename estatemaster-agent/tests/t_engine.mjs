// The formula engine against Excel on the functions and edge cases real estate and fund models use (fixtures/models/fn_sweep.xlsx,
// Excel's results stored as Excel saves them), and Excel Data Tables refreshed as Excel does (dtable_sens.xlsx). Synthetic fixtures.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext()).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+String(typeof d==='string'?d:JSON.stringify(d)).slice(0,300):''))}};
await p.goto(base);await p.waitForTimeout(2500);
const load=async(file,id,reads,run)=>p.evaluate(async([bytes,id,reads,run])=>{const buf=new Uint8Array(bytes).buffer;xcRaw=async()=>buf;const info=await xcEngine({id,src:'file',cells:{}});
  const v0=reads.length?await xcQ(()=>xcCall({op:'get',refs:reads})):[];let v1=null,v2=null;if(run){[v1]=await xcQ(()=>xcCall({op:'run',runs:[run],read:reads,reset:true}));v2=await xcQ(()=>xcCall({op:'get',refs:reads}))}
  return{info:{ok:info.ok,tot:info.tot,match:info.match,bad:info.bad,unsup:info.unsup},v0,v1,v2}},[[...fs.readFileSync(F+file)],id,reads,run]);
// 1. the function sweep: everything Excel stores is reproduced, except the three cases the engine has no way to run (they are named)
{const n=131,labels=[];const r=await load('fn_sweep.xlsx','SWEEP',[],null);const known=/^F!B(44|126|132)$/;
  const bad=(r.info.bad||[]).map(z=>typeof z==='string'?z:(z.k||z.ref||z[0]));
  ok(r.info.tot>=120&&r.info.match>=r.info.tot-3,`the engine reproduces Excel on ${r.info.match} of ${r.info.tot} stored results`,r.info);
  ok(bad.every(k=>known.test(String(k).replace(/\$/g,''))),'only HLOOKUP over an inline array, FREQUENCY and LAMBDA differ (no other function or edge case)',bad);
  ok((r.info.unsup||[]).join()==='FREQUENCY,LAMBDA','the functions the engine does not have are named for the user: FREQUENCY, LAMBDA',r.info.unsup)}
// 2. specific Excel behaviours fixed in the engine
{const r=await load('fn_sweep.xlsx','SWEEP2',['F!B72','F!B45','F!B53','F!B107','F!B111','F!B57','F!B48','F!B69'],null);const [rnd,lk,xm,nv,fx,d3,ind,cb]=r.v0;
  ok(rnd===1.01,'ROUND(1.005,2) is 1.01, as Excel (binary floating point gave 1.00)',rnd);
  ok(lk===170,'LOOKUP(2,1/(range="Office"),values) gives the last match, as Excel',lk);
  ok(xm===2&&nv===1234.5&&fx==='1,234.6','XMATCH, NUMBERVALUE and FIXED as Excel',[xm,nv,fx]);
  ok(d3===60,'a 3D reference SUM(S1:S3!A1) adds the cell on each sheet',d3);
  ok(ind===90,'INDIRECT("Data!B"&n) reads row n of column B',ind);
  ok(cb===2,'COUNTBLANK counts a cell whose formula gives "" as blank, as Excel',cb)}
// 2b. Excel 365's regular expressions
{const r=await load('fn_sweep.xlsx','SWEEP3',['F!B133','F!B134','F!B135','F!B136','F!B137'],null);
  ok(JSON.stringify(r.v0)===JSON.stringify([true,'2026-03-15','Northstar','1250000','a-b+c']),'REGEXTEST, REGEXEXTRACT (match and group) and REGEXREPLACE (all and the 2nd occurrence) as Excel',r.v0)}
// 2c. MROUND on a tie, as Excel: 10.35 to the nearest 0.1 is 10.4 (the quotient read as 103.5, not 103.4999…); a half away from zero; signs that differ are an error
{const v=await p.evaluate(()=>xcQ(()=>xcCall({op:'calc',fs:[['=MROUND(10.35,0.1)','F'],['=MROUND(1.05,0.1)','F'],['=MROUND(-2.5,-1)','F'],['=MROUND(17,5)','F'],['=ISERROR(MROUND(5,-2))','F'],['=MROUND(0.3,0.1)','F']]})));
  ok(JSON.stringify(v)===JSON.stringify([10.4,1.1,-3,15,true,0.3]),'MROUND as Excel on ties (10.35 → 10.4, 1.05 → 1.1, −2.5 → −3), 17 → 15, a sign mismatch is an error',v)}
// 3. Excel Data Tables: refreshed with their own inputs after a change, a formula that reads the table sees the new values, all put back after
{const reads=['Sens!B6','Sens!F9','Sens!G10','Sens!H11','Sens!K10','Sens!B12'];const r=await load('dtable_sens.xlsx','DT',reads,[['Sens!B5',2000]]);
  const close=(a,b)=>Math.abs(a-b)<1e-6*Math.max(1,Math.abs(b));
  ok(r.info.ok&&close(r.v0[1],16985.858511)&&close(r.v0[3],16222.038699),'a two-way Data Table reads as Excel stored it',r.v0);
  ok(close(r.v1[1],33971.717022)&&close(r.v1[2],33122.116409)&&close(r.v1[4],33122.116409),'after a change the two-way and one-way tables are recalculated with their own inputs (rent doubled: every cell doubles)',r.v1);
  ok(close(r.v1[5],33971.717022),'a formula that reads a table cell (=F9) sees the refreshed value',r.v1[5]);
  ok(r.v2.every((v,i)=>close(v,r.v0[i])),'after the change the workbook is back exactly as uploaded',r.v2)}
ok(!errs.length,'no page errors',errs);
console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);

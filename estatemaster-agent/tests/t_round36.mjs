// Round 36: properties any correct answer must hold, on every synthetic model (fixtures/models), whatever its layout:
// 1. the app's exact recalculation of a change equals LibreOffice's (golden answers in fixtures/golden/props.json);
// 2. every IRR the model map names is reproduced by its own cash-flow line;
// 3. every money headline equals its cell times the unit its sheet states (SAR '000 read as thousands, full units shown);
// 4. a fixed-rate currency conversion leaves every IRR where it was;
// 5. the scenario switch, where there is one, moves the results.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const G=JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/golden/props.json',import.meta.url).pathname,'utf8'));
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
// one browser context per worker: each model clears the page's storage
async function mk(){const ctx=await b.newContext({viewport:{width:1400,height:900}});await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
await ctx.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));let AI=true;   // an AI is connected, as on production (the money lines are read by it)
await ctx.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:AI?{anthropic:true,openai:true}:{}})});if(!AI)return r.fulfill({status:503,body:'{}'});
  const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));const u0=String((pl.messages.find(m=>m.role==='user')||{}).content||'');
  const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
  // the AI's money classification, as a careful reader would: amounts are money; rates, shares, counts, periods, dates and areas are not
  if(/amounts of money/.test(sys)){const ids=[...u0.matchAll(/^(g\d+): (.+)$/gm)].filter(m=>{const ex=(m[2].match(/e\.g\. ([-\d., ]+)/)||[])[1]||'';const big=ex.split(',').map(v=>Math.abs(parseFloat(v))).filter(Number.isFinite).some(v=>v>=1000);
      const moneyWord=/\b(quarterly rent|rent|loan|repayment|equity|price|cost|value|proceeds|capex|capital expenditure|commitments?|land)\b/i.test(m[2])&&!/shown as %|rate|growth|ratio|share|in its formula/i.test(m[2]);
      return (big||moneyWord)&&!/shown as %|in its formula|calendar|\bdates?\b|period|\bquarters?\b|\bmonths?\b|\byears?\b(?!\s*\d)|beds|units|sq|area|count/i.test(m[2].replace(/\(.*?cells?, e\.g\..*\)$/,''))}).map(m=>m[1]);return reply(JSON.stringify({money:ids}))}
  return reply('{}')});return ctx}
const errs=[];let pass=0,fail=0;const T=out=>(c,m)=>{out.push((c?'PASS':'FAIL')+' | '+m);c?pass++:fail++};
// the models run on a few pages at once (R36_PAR, default 3); each model's lines are printed together
async function one(f,g,ctx){const out=[],t=T(out),p=await ctx.newPage();p.on('pageerror',e=>errs.push(f+': '+e.message));try{
  await p.goto(base);await p.evaluate(()=>{localStorage.clear();localStorage.setItem('em_map2','1')});await p.reload();await p.waitForTimeout(1200);
  await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+f+'.xlsx');await p.waitForTimeout(1800);await p.click('#npCreate');
  for(let i=0;i<40;i++){await p.waitForTimeout(500);if(await p.evaluate(()=>{const x=latestExport();return !!(x&&x.map)}))break}
  const r=await p.evaluate(async g=>{const x=latestExport();await xcEngine(x);const runs=[[],...g.changes.map(c=>[c[0]])];const res=await xcQ(()=>xcCall({op:'run',runs,read:g.read,reset:true}));
    const m=x.map;const cf=(m.cashflows||[]).map(c=>[c.irr,m.proof['cf:'+c.irr]]);const units=[];
    for(const k of ['net_profit','total_cost','gross_revenue','peak_debt','gp_profit','lp_profit'])if(x.cells[k]&&Number.isFinite(x.out[k])){const [v]=await xcQ(()=>xcCall({op:'get',refs:[x.cells[k]]}));const sh=String(x.cells[k]).replace(/!.*$/,'');const u=((m.units||[]).find(z=>z.sheet===sh)||{}).scale||1;units.push([k,x.out[k],v,u])}
    const mult=[];for(const k of Object.keys(x.cells))if(/multiple/.test(k)&&Number.isFinite(x.out[k])){const [v]=await xcQ(()=>xcCall({op:'get',refs:[x.cells[k]]}));mult.push([k,x.out[k],v])}
    return{res,cf,units,mult,sw:m.scenario?m.proof.scenario:null}},g);
  const close=(a,b2)=>a.every((v,i)=>Math.abs(v-b2[i])<2e-6);
  if(g.key){const cells=await p.evaluate(()=>latestExport().cells);const bad=Object.entries(g.key).filter(([k,c])=>String(cells[k]||'').replace(/'/g,'')!==c);t(!bad.length,`${f}: each headline is read from its own cell${bad.length?': '+bad.map(([k,c])=>`${k} want ${c} got ${cells[k]||'—'}`).join(', '):''}`)}
  t(close(r.res[0],g.base),`${f}: the workbook as uploaded matches LibreOffice: ${r.res[0].map(v=>(v*100).toFixed(4)+'%').join(', ')}`);
  g.changes.forEach((c,i)=>t(close(r.res[i+1],c[1]),`${f}: ${c[0][0]} → ${c[0][1]} recalculated exactly as LibreOffice: ${r.res[i+1].map(v=>(v*100).toFixed(4)+'%').join(', ')} vs ${c[1].map(v=>(v*100).toFixed(4)+'%').join(', ')}`));
  t(r.cf.length&&r.cf.every(([k,s])=>s==='ok'),`${f}: every IRR is reproduced by its own cash-flow line: ${r.cf.map(z=>z.join(' ')).join(', ')||'none found'}`);
  t(r.units.every(([k,o,v,u])=>Math.abs(o-v*u)<=1e-6*Math.abs(o)+1e-6),`${f}: every money headline is its cell times its sheet’s unit: ${r.units.map(([k,o,v,u])=>`${k} ${v}×${u}`).join(', ')||'no money headline'}`);
  t(r.mult.every(([k,o,v])=>typeof v==='number'&&Math.abs(o-v)<=1e-4*Math.max(1,Math.abs(v))),`${f}: every multiple is its cell as it stands, never scaled by a sheet’s unit: ${r.mult.map(([k,o,v])=>`${k} ${o} (cell ${v})`).join(', ')||'no multiple'}`);
  if(g.switch)t(r.sw==='ok',`${f}: the scenario switch moves the results`);
  // a fixed-rate conversion cannot move an IRR
  const fx=await p.evaluate(async CCY=>{const x=latestExport();try{const r=await a33Fx(x,{from:CCY,to:CCY==='EUR'?'USD':'EUR',rate:0.25,rate_is:'to_per_from'},async()=>{});return r&&r.figs?{same:r.same,n:r.pick.length,drop:(r.dropped||[]).map(g=>g.label),flag:/To be confirmed/.test(a33FxOut(r).md)}:{err:JSON.stringify(r).slice(0,160)}}catch(e){return{err:e.message}}},g.ccy||f.split('_').pop().toUpperCase());
  t(fx.same===true&&fx.n>0&&(!fx.drop.length||fx.flag),`${f}: converting at one fixed rate leaves every IRR unchanged, and any line left out is put to the user (${fx.n||0} money lines converted${fx.drop&&fx.drop.length?'; left as not money: '+fx.drop.join(', '):''})${fx.err?' '+fx.err:''}`)}
  catch(e){t(false,`${f}: stopped: ${e.message.slice(0,200)}`)}await p.close();console.log(out.join('\n'))}
{const q=Object.entries(G).filter(([f])=>f[0]!=='_');await Promise.all(Array.from({length:+(process.env.R36_PAR||3)},async()=>{const ctx=await mk();while(q.length){const [f,g]=q.shift();await one(f,g,ctx)}}))}
const t=T([]);t(!errs.length,'no page errors: '+errs.join(' | '));console.log(`${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);

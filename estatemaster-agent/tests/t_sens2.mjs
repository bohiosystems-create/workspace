// Sensitivity on an uploaded workbook (fixtures/models/sens2_sar.xlsx, synthetic, from gen/gen_sens2.py): every figure checked against
// LibreOffice's recalculation of the same workbook with the same change (fixtures/golden/sens2.json), to 1e-9. Also: the ranges the AI
// proposes are checked and a failed one goes back with its reason; the user's own values win; the model's switches (the debt cap, the
// DSCR cash trap) are found with the exact level where they flip; the IRR's own IFERROR is shown as n/a, never as a return of 0; the case
// the figures are around is named and can be changed; a case line the model does not run on gives way to the live one; a line typed
// period by period is asked how it moves (scaled, added to where it runs, shifted in time); several inputs move together; Monte Carlo
// draws correlated inputs; every setting can be changed on the result and run again; without an AI the defaults are used and said so.
import {chromium} from 'playwright';import fs from 'fs';
const F=new globalThis.URL('./fixtures/',import.meta.url).pathname;const G=JSON.parse(fs.readFileSync(F+'golden/sens2.json','utf8'));
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});let pass=0,fail=0;
const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+String(typeof d==='string'?d:JSON.stringify(d)).slice(0,500):''))}};
const near=(a,e,tol=1e-9)=>Number.isFinite(a)&&Number.isFinite(e)&&Math.abs(a-e)<=tol*Math.max(1,Math.abs(e));
const RANGE={calls:[],bad:true};
async function page(ai){const cx=await b.newContext({viewport:{width:1500,height:1000}});const p=await cx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));await p.route('**/api/log',r=>r.fulfill({status:200,body:'{}'}));
  await p.route('**/api/llm',async r=>{if(r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:{anthropic:ai,openai:ai}})});
    const j=JSON.parse(r.request().postData()),pl=j.payload,sys=String(pl.system||(pl.messages[0]&&pl.messages[0].role==='system'?pl.messages[0].content:''));const u0=String((pl.messages.find(m=>m.role==='user')||{}).content||'');
    const reply=t=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j.provider==='openai'?{choices:[{message:{content:t},finish_reason:'stop'}]}:{model:pl.model,content:[{type:'text',text:t}],stop_reason:'end_turn'})});
    if(/You set the range over which each input/.test(sys)){RANGE.calls.push(u0);const retry=/failed these checks/.test(u0);const out=[];
      for(const m of u0.matchAll(/^((?:'[^']+'|[A-Za-z ]+)![A-Z]+\d+) \| ([^|]+) \| .*units allowed: ([a-z]+)/gm)){const cell=m[1],lab=m[2].toLowerCase(),u1=m[3];
        if(/exit yield/.test(lab))out.push(RANGE.bad&&!retry?{cell,unit:'pct',down:5,up:5,why:'yields move'}:{cell,unit:'bps',down:50,up:75,why:'logistics yields moved 50–75 bps in past cycles'});
        else if(/occupancy/.test(lab))out.push(RANGE.bad&&!retry?{cell,unit:'pts',down:5,up:10,why:'lease-up risk'}:{cell,unit:'pts',down:5,up:5,why:'lease-up risk, capped at full occupancy'});
        else if(/construction/.test(lab))out.push({cell,unit:'pct',down:5,up:15,why:'cost overruns run larger than savings'});
        else if(/rent/.test(lab))out.push({cell,unit:'pct',down:10,up:10,why:'rents moved ±10% across the cycle'});
        else if(/exit year/.test(lab))out.push({cell,unit:'periods',down:1,up:1,why:'a sale a year either side'});
        else if(/interest/.test(lab))out.push({cell,unit:'bps',down:100,up:100,why:'rate cycle'});
        else if(/growth/.test(lab))out.push({cell,unit:'bps',down:100,up:100,why:'inflation range'});
        else out.push({cell,unit:u1,down:u1==='bps'?50:u1==='periods'?1:5,up:u1==='bps'?50:u1==='periods'?1:5,why:'typical range'})}
      return reply(JSON.stringify({ranges:out}))}
    reply('{}')});
  await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);return{p,errs}}
const up=async(p,m)=>{await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'models/'+m);await p.waitForTimeout(1800);await p.click('#npCreate');await p.waitForFunction(()=>{const x=latestExport();return x&&XC.info[x.id]},null,{timeout:120000});
  await p.waitForFunction(()=>{const x=latestExport();return x.audit&&x.audit.status!=='running'},null,{timeout:240000}).catch(()=>{});return p.evaluate(()=>{const x=latestExport();return{out:x.out,pct:XC.info[x.id].pct}})};
const A=(p,tool,args)=>p.evaluate(async([tool,args])=>{const o=await handle('','web','Investment Director',{k:'a33',tool,args});const r=window.A33LAST;window.A33LAST=null;
  const L=r&&r.ls?r.ls.map(l=>({cell:l.cell,label:l.label,moves:l.moves,vals:l.vals,unit:l.r&&l.r.unit,by:l.r&&l.r.by,why:l.r&&l.r.why,mode:l.mode,series:!!l.series,down:l.r&&l.r.down,up:l.r&&l.r.up})):null;
  return{plain:o.plain||'',html:(o.html||'')+(o.keep||''),r:r?{v0:r.v0,grid:r.grid,binds:r.binds,limits:r.limits,notes:r.notes,ls:L,vals:r.vals,X:r.X&&r.X.map(l=>({cell:l.cell,moves:l.moves})),Y:r.Y&&r.Y.map(l=>({cell:l.cell,moves:l.moves})),B:r.B&&r.B.text,dn:r.dn,up:r.up,corr:r.corr,p50:r.p50}:null}},[tool,args]);

const {p,errs}=await page(true);
const w=await up(p,'sens2_sar.xlsx');ok(w.pct===100&&Math.abs(w.out.levered_irr/100-G.base)<1e-6,'the model reads exactly (levered IRR '+w.out.levered_irr+'%)',w);

// 1. the tornado on its own: a line typed period by period is asked how it moves, never assumed
let r=await A(p,'tornado',{});ok(/Occupancy/.test(r.plain)&&/how should it move/.test(r.plain)&&['scale','add','shift'].every(v=>r.html.includes(`data-a33a="${v}"`)),'a line typed period by period (Occupancy): asked how it moves, with three answers',r.plain.slice(0,300));
RANGE.calls.length=0;r=await A(p,'tornado',{series_mode:'add'});const T=r.r;
ok(T&&near(T.v0,G.base,1e-9),'the tornado is around today’s exact figure',T&&T.v0);
ok(RANGE.calls.length===2&&/failed these checks/.test(RANGE.calls[1])&&/Inputs!B9: the unit “pct” does not fit Exit yield/.test(RANGE.calls[1])&&/Occupancy cannot go above 100%/.test(RANGE.calls[1]),'the AI’s ranges are checked: a yield in % and an occupancy above 100% go back with the reason, once',RANGE.calls[1]&&RANGE.calls[1].slice(-400));
const ly=T&&T.ls.find(l=>l.cell==='Inputs!B9');ok(ly&&ly.unit==='bps'&&ly.down===50&&ly.up===75&&/50–75 bps/.test(ly.why)&&near(ly.vals[0],G.yield['0.065'],1e-9),'the exit yield moves over the AI’s second range (−50 / +75 bps, with its reason), each point exact',ly);
const lc=T&&T.ls.find(l=>l.cell==='Inputs!B8');ok(lc&&lc.down===5&&lc.up===15&&JSON.stringify(lc.moves)==='[-5,-2.5,0,7.5,15]'&&near(lc.vals[0],G.cost['570000000.0'],1e-9)&&near(lc.vals[2],G.base,1e-9),'construction cost: the AI’s asymmetric range (−5% / +15%: overruns run larger), exact',lc&&{moves:lc.moves,vals:lc.vals});
ok(T&&T.ls[0]&&T.ls[0].label==='Construction cost'&&T.ls.slice(0,3).some(l=>/Rent per sqm · Base/.test(l.label))&&T.ls.slice(0,3).some(l=>l.label==='Exit yield')&&T.ls.every((l,i)=>!i||Math.max(...l.vals)-Math.min(...l.vals)<=Math.max(...T.ls[i-1].vals)-Math.min(...T.ls[i-1].vals)+1e-15),'ranked by exact swing over each input’s own range: construction cost first (its −5% / +15% overrun range), then rent and exit yield',T&&T.ls.map(l=>l.label));
ok(T&&!T.ls.some(l=>/Downside/.test(l.label)||/Scenario/.test(l.label)),'the case line the model does not run on, and the case switch, are not ranked',T&&T.ls.map(l=>l.label));
const lo=T&&T.ls.find(l=>/Occupancy/.test(l.label));ok(lo&&lo.series&&lo.mode==='add'&&lo.unit==='pts'&&near(lo.vals[0],G.occ_add['-5'],1e-9)&&near(lo.vals[lo.vals.length-1],G.occ_add['5'],1e-9),'occupancy moved as asked (5 pts where it runs, construction years kept at 0), exact at both ends',lo);
ok(T&&T.binds.some(z=>/Construction cost from 572,390,57\d/.test(z)&&/Debt drawn/.test(z)&&/MIN now takes Inputs!\$B\$13/.test(z)),'the debt cap is found binding, with the exact construction cost where it starts (572,390,572: LibreOffice 340M ÷ (55% × 1.08))',T&&T.binds);
ok(/What moves Levered IRR most/.test(r.plain)&&/around the Base case \(Inputs!B2 = 1, as the workbook stands\)/.test(r.plain),'the result names the case it is around',r.plain.slice(0,300));
ok(/logistics yields moved 50–75 bps/.test(r.plain),'each range is shown with whose it is and why',r.plain.slice(-900));
ok(/<details class="svc"/.test(r.html)&&/data-svrun=/.test(r.html),'the settings can be changed on the result');
const n0=RANGE.calls.length;r=await A(p,'tornado',{series_mode:'add'});ok(RANGE.calls.length===n0,'the AI’s ranges are kept for the model: a second tornado asks for none',RANGE.calls.length-n0);

// 2. the user's own ranges win, every point against LibreOffice
r=await A(p,'tornado',{inputs:[{cell:'Inputs!B8',unit:'pct',down:10,up:10},{cell:'Inputs!B9',unit:'bps',down:50,up:50},{label:'Exit year',values:[6,7,8,9,10]},{cell:'Inputs!B15',unit:'pct',down:10,up:10}],points:5});
{const L=r.r.ls,g=c=>L.find(l=>l.cell===c);const c=g('Inputs!B8'),y=g('Inputs!B9'),e=g('Inputs!B10'),fe=g('Inputs!B15');
  ok(c&&[540e6,570e6,600e6,630e6,660e6].every((v,i)=>near(c.vals[i],G.cost[v.toFixed(1)],1e-9)),'construction cost ±10% at 5 points: each the LibreOffice figure',c&&c.vals);
  ok(y&&[0.065,0.0675,0.07,0.0725,0.075].every((v,i)=>near(y.vals[i],G.yield[String(v)],1e-9)),'exit yield ±50 bps at 5 points: each the LibreOffice figure',y&&y.vals);
  ok(e&&[6,7,8,9,10].every((v,i)=>near(e.vals[i],G.exit[String(v)],1e-9)),'exit year 6 to 10, the user’s own values: each the LibreOffice figure',e&&e.vals);
  ok(fe&&near(fe.vals[0],G.fees['0.072'],1e-9)&&near(fe.vals[4],G.fees['0.088'],1e-9),'professional fees, a number written in a formula (=B8*0.08): moved where it is written, exact',fe&&fe.vals);
  ok(r.r.limits.some(z=>/Exit year at 10: the cash flow then reaches the model’s last period/.test(z)),'an exit moved to the last period is said: what falls after it is not in the model',r.r.limits);
  ok(r.r.binds.some(z=>/^Exit year between \d+ and \d+: .*IF\(.*Inputs!\$B\$10\) moves along the row: it stops holding in .* and holds in /.test(z)),'a timing switch is one finding: the exit test moves along the row from one period to the next',r.r.binds)}

// 3. the grid: the user's values, every cell against LibreOffice; the cash trap found with the rent where it starts; the interaction measured
r=await A(p,'sensitivity_grid',{x:{label:'Rent per sqm',values:[120,135,150,165,180]},y:{label:'Exit yield',values:[6.5,7,7.5]},metric:'levered_irr'});
{const R=r.r;ok(R&&R.X[0].cell==='Inputs!B3','“Rent per sqm” matches two case lines: the one the model runs on (Base, Inputs!B3) is used',R&&R.X);
  let all=!!R;if(R)[120,135,150,165,180].forEach((rv,i)=>[0.065,0.07,0.075].forEach((yv,j)=>{if(!near(R.grid[j][i],G.grid[`${rv}|${yv}`],1e-9))all=false}));ok(all,'all 15 cells of the grid are the LibreOffice figures',R&&R.grid);
  ok((r.html.match(/<td /g)||[]).length===15&&(r.html.match(/ ●/g)||[]).length===2,'15 cells; today’s rent and yield marked');
  ok(R&&R.binds.some(z=>/Rent per sqm · Base from 130(\.0+)?\b/.test(z)&&/Cash trapped/.test(z)),'the DSCR cash trap is found switching on at a rent of exactly 130 (LibreOffice: 150 × 1.30 ÷ 1.50)',R&&R.binds);
  ok(R&&R.notes.some(z=>/interact in the model/.test(z)),'rent and exit yield interact in the model (the sale price is one over the other): measured and said',R&&R.notes)}

// 4. a case line the model does not run on, named by the user: the live one is moved, and said
r=await A(p,'sensitivity_grid',{x:{label:'Rent per sqm · Downside',cell:'Inputs!B4'},y:{label:'Exit yield',cell:'Inputs!B9'}});
ok(r.r&&r.r.X[0].cell==='Inputs!B3'&&/Rent per sqm · Downside \(Inputs!B4\) is not the case the model runs on: Rent per sqm · Base \(Inputs!B3\) is/.test(r.plain),'the Downside rent line (not live) gives way to the Base line, and the answer says so',r.plain.slice(0,600));

// 5. the case changed: the Downside case, its own rent line live
r=await A(p,'sensitivity_grid',{case:'Downside',x:{label:'Rent per sqm',values:[108,120,132]},y:{label:'Exit yield',values:[7]}});
ok(r.r&&r.r.X[0].cell==='Inputs!B4'&&near(r.r.v0,G.downside_case,1e-9)&&near(r.r.grid[0][2],G.downside_rent_up,1e-9)&&/the Downside case \(Inputs!B2 set to 2\)/.test(r.plain),'on the Downside case: its own rent line moves, every figure exact, the case named',r.r&&{X:r.r.X,v0:r.r.v0});

// 6. what the model cannot give: its IRR's IFERROR at a deep downside is n/a, never a 0% return
r=await A(p,'sensitivity_grid',{x:{label:'Rent per sqm',values:[20,150]},y:{label:'Exit yield',values:[7]}});
ok(r.r&&r.r.grid[0][0]===0&&G.rent20[0]===0&&/n\/a ⓘ/.test(r.html)&&r.r.limits.some(z=>/IFERROR/.test(z)&&/does not exist/.test(z)),'rent at 20: the model’s IFERROR gives 0; shown n/a and explained, not as a return of 0%',r.r&&r.r.limits);

// 7. a line typed period by period, each way it can move
r=await A(p,'tornado',{inputs:[{label:'Occupancy',mode:'scale',unit:'pct',down:10,up:10}],points:3});
{const l=r.r&&r.r.ls[0];ok(l&&near(l.vals[0],G.occ_scale['-10'],1e-9)&&l.moves.length===2&&r.r.limits.some(z=>/Occupancy cannot go above 100%: that end of the range is left out/.test(z)),'occupancy scaled: −10% exact; +10% would pass 100%, so it is left out and said',r.r&&{l,lim:r.r.limits})}
r=await A(p,'tornado',{inputs:[{label:'Occupancy',mode:'shift',unit:'periods',down:1,up:1}],points:3});
{const l=r.r&&r.r.ls[0];ok(l&&near(l.vals[0],G.occ_shift['-1'],1e-9)&&near(l.vals[2],G.occ_shift['1'],1e-9),'occupancy shifted a year earlier and later: exact',l)}

// 8. several inputs together, against each alone
r=await A(p,'joint_sensitivity',{levers:[{label:'Rent per sqm',unit:'pct',down:10,up:10,downside:'down'},{label:'Exit yield',unit:'bps',down:50,up:50,downside:'up'},{label:'Construction cost',unit:'pct',down:10,up:10,downside:'up'}],points:5});
{const R=r.r;const sum=G.joint_solo.reduce((s,v)=>s+v-G.base,0);ok(R&&near(R.vals[0],G.joint_down,1e-9)&&near(R.dn.both,G.joint_down-G.base,1e-9)&&near(R.dn.sum,sum,1e-9),'the full downside (rent −10%, yield +50 bps, cost +10% at once) and the three moves alone: all exact',R&&{v:R.vals,dn:R.dn});
  ok(/Together the downside moves Levered IRR −8\.69 pts; the same moves one at a time add up to −8\.77 pts/.test(r.plain),'together against one at a time, said in points',r.plain.slice(0,900))}
r=await A(p,'joint_sensitivity',{levers:[{label:'Rent per sqm',downside:'down'},{label:'Exit yield'}]});ok(/which way does Exit yield move/.test(r.plain),'a joint move without a direction for an input: asked');

// 9. Monte Carlo with correlated inputs, and correlations that cannot hold together
r=await A(p,'monte_carlo',{variables:[{label:'Rent per sqm',pct_range:10},{label:'Exit yield',pct_range:10}],runs:300,correlations:[{a:'Rent per sqm',b:'Exit yield',rho:-0.6}]});
ok(r.r&&r.r.corr&&r.r.corr.length===1&&Math.abs(r.r.corr[0].got+0.6)<0.08&&/Rent per sqm · Base – Exit yield: -0\.6, -0\.\d\d in the draws/.test(r.plain),'Monte Carlo draws rent and exit yield moving together (−0.6 asked, the same in the draws)',r.r&&r.r.corr);
r=await A(p,'monte_carlo',{variables:[{label:'Rent per sqm',pct_range:10},{label:'Exit yield',pct_range:10},{label:'Construction cost',pct_range:10}],runs:200,correlations:[{a:'Rent per sqm',b:'Exit yield',rho:0.9},{a:'Exit yield',b:'Construction cost',rho:0.9},{a:'Rent per sqm',b:'Construction cost',rho:-0.9}]});
ok(/cannot all hold at once/.test(r.plain),'correlations that cannot hold together: asked, not drawn',r.plain.slice(0,200));

// 10. the chat's own sensitivity table on the workbook carries the same notes
const cn=await p.evaluate(async()=>{const r=await xcSensGrid({assumption:'Rent per sqm · Base',cell:'Inputs!B3',shifts:[-20,-10,0,10,20],kind:'pct'},{assumption:'Exit yield',cell:'Inputs!B9',shifts:[-0.5,0,0.5],kind:'pts'},'levered_irr',async()=>{});return r&&r.notes});
ok(cn&&cn.some(z=>/Around the Base case/.test(z))&&cn.some(z=>/Cash trapped/.test(z))&&cn.some(z=>/interact/.test(z)),'the chat’s sensitivity table on the workbook: the case, the cash trap switching on, the interaction',cn);

// 11. change the settings on the result and run again
r=await A(p,'tornado',{inputs:[{cell:'Inputs!B8',unit:'pct',down:10,up:10},{cell:'Inputs!B9',unit:'bps',down:50,up:50}],points:5});
await p.evaluate(h=>{toggleDock(true);addMsg('agent',h)},r.html);const box=p.locator('details.svc').last();await box.locator('summary').click();
await box.locator('.svl[data-li="0"] [data-f="down"]').fill('20');await box.locator('.svl[data-li="0"] [data-f="up"]').fill('20');await box.locator('[data-g="points"]').fill('3');
const nMsg=await p.evaluate(()=>document.querySelectorAll('.msg').length);await box.locator('[data-svrun]').click();
await p.waitForFunction(n=>document.querySelectorAll('.msg').length>=n+2&&/What moves/.test([...document.querySelectorAll('.msg')].pop().textContent),nMsg,{timeout:120000}).catch(()=>{});
const last=await p.evaluate(()=>[...document.querySelectorAll('.msg')].pop().textContent);ok(/480,000,000 to 720,000,000/.test(last)&&/Construction cost: ±20% \(you\)/.test(last)&&/at 3 points/.test(last),'the result run again from its own settings: construction cost now ±20% at 3 points, said as the user’s',last.slice(0,400));
ok(!errs.length,'no page errors',errs);

// 11b. a model that rounds its tariffs with MROUND: at −10% a tariff lands on a tie (10.35 → 10.40 in Excel), recalculated as Excel and LibreOffice do
await up(p,'r24_toll_eur.xlsx');r=await A(p,'tornado',{inputs:[{label:'Tariff heavy (EUR)',unit:'pct',down:10,up:10}],points:3});
ok(r.r&&near(r.r.ls[0].vals[0],0.085737269952183,1e-9),'toll road, heavy tariff −10%: 8.5737% as LibreOffice (MROUND on a tie rounds up, as Excel)',r.r&&r.r.ls[0].vals);
// 11c. a model with no IRR headline (a REIT): which result to rank by is asked, with the model's own results as answers
await up(p,'r27_reit_sar.xlsx');r=await A(p,'tornado',{});const chips=[...r.html.matchAll(/data-a33a="([^"]+)"/g)].map(m=>m[1]);
ok(/Which result should the inputs be ranked by/.test(r.plain)&&chips.length>=2,'no IRR headline: the result to rank by is asked, with the model’s results as answers',chips);
if(chips.length){r=await A(p,'tornado',{metric:chips[0],series_mode:'scale'});ok(/What moves .* most/.test(r.plain)&&r.r&&r.r.ls.length>=2,'ranked by the result chosen',r.plain.slice(0,200))}
// 11d. a large workbook (76,000 formulas, seconds per recalculation): the time allowed is kept, and what did not fit is said
await up(p,'hotel_us.xlsx');r=await A(p,'tornado',{series_mode:'scale'});ok(/One recalculation of this workbook takes [\d.]+ s: .* needs about \d+ minutes?\. Run it all, or what fits in 90 s/.test(r.plain)&&new Set((r.html.match(/data-a33a="\d+"/g)||[])).size===2,'a job of minutes, no time given: asked first (run it all, or what fits), with the time it needs',r.plain.slice(0,300));
const t0=Date.now();r=await A(p,'tornado',{seconds:30,series_mode:'scale'});const secs=(Date.now()-t0)/1000;
ok(/What moves Levered IRR most/.test(r.plain)&&secs<75&&/In the 30 s allowed \(one recalculation of this workbook takes [\d.]+ s\)/.test(r.plain),'a 76,000-formula workbook in a 30 s allowance: answered in '+Math.round(secs)+' s, with what did not fit said',r.plain.slice(-500));
// 12. without an AI: the default range of each kind, said so; the tornado reached from plain words
const q=await page(false);await up(q.p,'sens2_sar.xlsx');
const o=await q.p.evaluate(async()=>{const o=await handle('what drives the IRR?','web','Investment Director');return{plain:o.plain||'',html:(o.html||'')+(o.keep||'')}});
ok(/Occupancy/.test(o.plain)&&/data-a33a="add"/.test(o.html),'no AI, plain words (“what drives the IRR?”): the tornado, which first asks how the occupancy line moves',o.plain.slice(0,200));
const o2=await q.p.evaluate(async()=>{const o=await handle('','web','Investment Director',{k:'a33',tool:'tornado',args:{series_mode:'scale'}});return o.plain||''});
ok(/What moves Levered IRR most/.test(o2)&&/default for this kind of input: no AI range connected/.test(o2)&&/Exit yield: ±50 bps/.test(o2),'no AI: each input over the default range of its kind (an exit yield ±50 bps), said so',o2.slice(-700));
ok(!q.errs.length,'no page errors without an AI',q.errs);
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);

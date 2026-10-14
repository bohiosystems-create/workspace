// Self-correction: a result that fails an exact check is sent back to both analysts; a fixed result replaces it, an unfixed one stays flagged.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const r=await p.evaluate(async()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';setHurdle(18,'typed');window.checkerAgent=async()=>({model:'c',verdicts:[],summary:''});const o=latestExport().out,R={};
  const mk=(irr,poc)=>JSON.stringify({method:'m',results:[{metric:'levered_irr',base:o.levered_irr,value:irr,working:'w'},{metric:'profit_on_cost',base:o.profit_on_cost,value:poc,working:'w'}]});
  let fixes=true;window.callOne=async(pr,m,sys,msgs)=>{const u=msgs[0].content;if(/failed these exact checks/.test(u))return{text:fixes?mk(o.levered_irr-2.1,o.profit_on_cost-3):mk(o.levered_irr+2,o.profit_on_cost+3)};return{text:mk(o.levered_irr+2,o.profit_on_cost+3)}};
  const steps=[];const a=await aiCrossCheck([{text:'sale price −10%'}],async s=>steps.push(s));const ir=a.metrics.find(m=>m.k==='levered_irr');
  R.fixed={status:ir.status,value:+ir.value.toFixed(2),flag:ir.flag,steps:steps.filter(s=>/recalculate|correction round/.test(s)),plain:testPlain(a)};
  fixes=false;const b2=await aiCrossCheck([{text:'sale price −10%'}],async()=>{});const ir2=b2.metrics.find(m=>m.k==='levered_irr');R.unfixed={status:ir2.status,flag:ir2.flag};R.base=o.levered_irr;return R});
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(r.fixed.steps.length>=2,'failed checks go back to both analysts: '+r.fixed.steps.join(' / '));
t(r.fixed.status==='corrected'&&!r.fixed.flag&&r.fixed.value<r.base,'the recalculated result replaces the wrong one and passes ('+r.base+'% → '+r.fixed.value+'%, '+r.fixed.status+')');
t(/corrected after failed checks/.test(r.fixed.plain),'the answer says it was corrected after failed checks');
t(r.unfixed.flag&&r.unfixed.status!=='corrected','when the recalculation does not fix it, the figure stays flagged');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_selfcorrect:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();

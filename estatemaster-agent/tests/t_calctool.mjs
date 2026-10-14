// The chat's exact calculator: arithmetic, chained names, IRR/NPV/PMT, units, safety, and every result registered as a worked figure.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=full');await p.waitForTimeout(1200);
const r=await p.evaluate(()=>{const R={};const v=(e,vars)=>{try{return calcEval(e,vars||{})}catch(x){return 'ERR:'+x.message}};
  R.basic=v('1200 * 14 * 0.82');R.exp=v('2.5e6 / 1e3');R.pct=v('13500 * 5%');R.irr=v('irr([-100, 0, 0, 133.1], 1)');R.irrq=v('irr([-100,0,0,0,110],4)');R.npv=v('npv(10, [-100, 110])');R.pmt=v('pmt(1, 12, 1000)');R.list=v('sum([1,2,3], 4)');
  R.bad1=v('alert(1)');R.bad2=v('constructor');R.bad3=v('this.x');R.bad4=v('1/0');R.bad5=v('irr([100,200])');
  const t=calcTool([{name:'extra_gfa',expression:'1200 * 14',label:'extra GFA (sqm)'},{name:'extra_rev',expression:'extra_gfa * 0.82 * 13500',label:'extra revenue'},{name:'oops',expression:'extra_gfa * nothing'}]);R.tool=t;
  const id=+(t.match(/⟦calc#(\d+)⟧/)||[])[1];R.work=(WORK.find(w=>w.id===id)||{}).text||'';R.sys=/never work a number out in your head/.test(sysPrompt('web','director'));R.inTools=TOOLS.some(t=>t.name==='calculate');return R});
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(r.basic===13776,'1200 × 14 × 0.82 = 13,776 ('+r.basic+')');t(r.exp===2500,'2.5e6 / 1e3 = 2,500 ('+r.exp+')');t(Math.abs(r.pct-675)<1e-9,'13,500 × 5% = 675 ('+r.pct+')');
t(Math.abs(r.irr-10)<1e-6,'IRR of −100, 0, 0, 133.1 = 10% ('+r.irr+')');t(Math.abs(r.irrq-10)<1e-6,'quarterly flows annualised: 10% ('+r.irrq+')');t(Math.abs(r.npv-0)<1e-9,'NPV at 10% of −100, 110 = 0 ('+r.npv+')');t(Math.abs(r.pmt+88.8488)<1e-3,'PMT(1%, 12, 1000) = −88.85 ('+r.pmt+')');t(r.list===10,'sum of a list and a number ('+r.list+')');
t([r.bad1,r.bad2,r.bad3].every(x=>/^ERR/.test(x)),'no code can run: '+[r.bad1,r.bad2,r.bad3].join(' | '));t(/^ERR/.test(r.bad4)&&/^ERR/.test(r.bad5),'division by zero and an IRR with no sign change are errors, not numbers');
t(/extra_rev = 185,976,000/.test(r.tool),'chained calculation (16,800 sqm × 0.82 × 13,500 = 185,976,000): '+r.tool.split('\n')[2]);t(/oops: ERROR/.test(r.tool),'an unknown name is reported, not guessed');
t(/1200 \* 14 = 16,800/.test(r.work)&&/calculator/.test(r.work),'each result is a clickable worked figure: '+r.work.split('\n')[0]);t(r.sys&&r.inTools,'the chat is told to use it, and has it');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_calctool:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();

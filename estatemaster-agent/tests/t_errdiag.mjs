// Errors already in a workbook, traced to their cause: the debug finds the cell each chain of errors starts from (its own inputs fine), says
// why it errors from its formula and the input that breaks it, and tests the cause by recalculating without it (the workbook is left as it
// was). The headline figures an error hides are named at upload with their cause, and come back with their figures under the fix.
import {chromium} from 'playwright';
const F=new globalThis.URL('./fixtures/models/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined}),p=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());
const errs=[];p.on('pageerror',e=>errs.push(e.message));
let pass=0,fail=0;const ok=(c,name,detail)=>{c?pass++:fail++;console.log((c?'PASS':'FAIL')+' | '+name+(detail?' → '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,500):''))};
const irrOf=c=>{let lo=-0.99,hi=5;for(let i=0;i<300;i++){const m=(lo+hi)/2,v=c.reduce((s,x,t)=>s+x/(1+m)**t,0);v>0?lo=m:hi=m}return lo};
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>openNewProject());await p.setInputFiles('#npFile',F+'r42_errs_sar.xlsx');await p.waitForSelector('#npCreate:not([disabled])',{timeout:120000});await p.click('#npCreate');await p.waitForTimeout(4000);
await p.evaluate(async()=>{await xcEngine(latestExport())});await p.waitForFunction(()=>latestExport().errHeads,null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(1500);

// 1. at upload: each headline the workbook cannot give is said with the cell its error comes from and why
let t=await p.evaluate(()=>[...document.querySelectorAll('#msgs .msg.agent')].map(m=>m.innerText).join('\n'));
ok(/Levered IRR \(Returns!B1\) gives #VALUE! in the workbook: it comes from “Rent a year” Calc!B1 \(#VALUE!\): it reads “Rent per sqm” \(Inputs!B2\), which holds the text “1,200 SAR”: a number typed as text/.test(t),'at upload, the levered IRR’s error is traced to the rent typed as text, three cells back',t.slice(-700));
ok(/Unlevered IRR \(Returns!B2\) gives #NUM! in the workbook: the cash flow it reads \(Calc!B21:E21\) is never positive/.test(t),'an IRR with no root is said with the cash flow it reads',t.slice(-500));

// 2. the debug: one finding per cause (the cells that inherit it counted under it), its cause, its fix tested on the workbook
const C=await p.evaluate(async()=>{const x=latestExport(),a={checks:[],steps:[]};await auEvidence(x,a);const g=await xcQ(()=>xcCall({op:'get',refs:['Inputs!B2','Inputs!B4','Inputs!B6','Calc!C11','Returns!B1']}));let f='';try{const r=await xcQ(()=>xcCall({op:'prec',refs:['Calc!C11']}));f=r[0].f}catch(e){}
  return{c:a.checks.filter(z=>z.code==='error-root').map(z=>z.level+' '+z.text),g,f}});
const find=re=>C.c.find(z=>re.test(z))||'';
const lev=irrOf([-30e6,10.8e6,10.8e6,10.8e6+10.8e6/0.07])*100;
let z=find(/Calc!B1\) gives #VALUE!/);const m=z.match(/Levered IRR ([\d.]+)%/);
ok(/^error /.test(z)&&/6 cells that read it give an error because of it/.test(z)&&/a headline figure among them/.test(z)&&/Fix: type 1200 in “Rent per sqm” \(Inputs!B2\) as a number\. Recalculated with it, the error clears/.test(z)&&m&&Math.abs(+m[1]-lev)<0.006,'#VALUE!: one cause for the chain, the number typed as text, its fix tested: the levered IRR comes back as by hand',{z,hand:lev.toFixed(2)});
z=find(/gives #DIV\/0!/);ok(/it divides by “Units” \(Inputs!B4\), which is 0/.test(z)&&/Recalculated with a value that is not 0 in Inputs!B4, the error clears/.test(z),'#DIV/0!: the divisor cell and its 0, and the error shown to clear without it',z);
z=find(/gives #N\/A/);ok(/looks up “phase 2 ” \(Inputs!B6\), and the table has “Phase 2”: they differ only in spaces or capitals/.test(z)&&/Fix: type “Phase 2” in “Phase” \(Inputs!B6\)/.test(z),'#N/A: the lookup key that differs only in spaces or capitals, the matching key as the fix',z);
z=find(/gives #REF!/);ok(/^error /.test(z)&&/Calc!C11 probably should read =C10\*Inputs!\$B\$3 \(the pattern of Calc!B11 beside it\)\. Recalculated with it, the error clears/.test(z),'#REF!: the deleted reference, and the formula of its neighbours carried to it as the fix, tested',z);
z=find(/gives #NAME\?/);ok(/it uses SUMM, which is not a function/.test(z),'#NAME?: the unknown function named, its own cause even though it reads another error',z);
z=find(/Returns!B2\) gives #NUM!/);ok(/^error /.test(z)&&/\(a headline figure\)/.test(z)&&/never positive, so there is no IRR/.test(z),'#NUM!: the headline IRR whose cash flow never turns positive',z);
ok(C.c.length===6,'six causes for the twelve cells in error, no more',C.c.length);
ok(C.g[0]==='1,200 SAR'&&C.g[1]===0&&C.g[2]==='phase 2 '&&C.g[3]&&C.g[3].err==='#REF!'&&C.g[4]&&C.g[4].err&&/#REF!/.test(C.f),'testing the causes leaves the workbook exactly as it was',C.g);
ok(errs.length===0,'no page errors',errs.join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);await b.close();process.exit(fail?1:0);

// Script review: a second model reads back each generated line (EN + AR) and its fixes replace the bad lines, keeping cues; wrong-language fixes rejected.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto(process.argv[2]||'http://localhost:4090/?mode=full');await p.waitForTimeout(1500);
const r=await p.evaluate(async()=>{const deck={slides:[{kind:'cover',title:'Daily report'},{kind:'changes',title:'16 things changed since 6 October',sub:'x'}]};const brief=kDeckBrief(deck);
  let sent=null;window.calcPair=()=>[{p:'anthropic',model:'m1'},{p:'openai',model:'gpt'}];window.callOne=async(pp,m,sys,msgs)=>{sent={sys,user:msgs[0].content};return{text:JSON.stringify({fixes:[{i:1,problem:'bare end value',say:'Sixteen inputs changed since 6 October. [[-]] The biggest is construction cost, up 8%, which would take the levered IRR from 21.4% down to 19.6%.'},{i:0,problem:'x',say:'مرحبا بكم في التقرير اليومي'}]})}};
  const raw=['Good morning. Let’s walk through the daily report.','Construction cost +8% would leave the levered IRR at 19.60%.'];const out=raw.map(t=>kCueSegs(t,[],'en'));
  const rv=await kScriptReview(deck,brief,raw,out,'en','anthropic','m1');
  const outAr=['أهلاً بكم','سطر'].map(t=>kCueSegs(t,[],'ar')),rawAr=['أهلاً بكم','سطر'];window.callOne=async(pp,m,sys)=>{sent.arSys=sys;return{text:'{"fixes":[{"i":1,"problem":"p","say":"تغيّرت ستة عشر مدخلاً منذ ٦ أكتوبر، أبرزها تكلفة البناء."}]}'}};
  const rvAr=await kScriptReview(deck,brief,rawAr,outAr,'ar','anthropic','m1');
  return{rv,line1:out[1].map(s=>s.t).join(' '),line0:out[0].map(s=>s.t).join(' '),rvAr,ar1:outAr[1].map(s=>s.t).join(' '),sysEn:/British English/.test(sent.sys),sysAr:/فصحى/.test(sent.arSys),hasSlides:/16 things changed/.test(sent.user)}});
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
t(r.rv.fixed.length===1&&r.rv.fixed[0].i===1,'English review applies one fix, rejects the Arabic-text fix');
t(/from 21.4% down to 19.6%/.test(r.line1),'bad line replaced: '+r.line1);
t(/walk through/.test(r.line0),'good line kept');
t(r.rvAr.fixed.length===1&&/ستة عشر/.test(r.ar1),'Arabic fix applied');
t(r.sysEn&&r.sysAr,'reviewer told the language (British English / فصحى)');t(r.hasSlides,'reviewer sees the slide data');
t(!errs.length,'no page errors '+errs.join('; '));console.log(ok.join('\n'));console.log('t_screview:',ok.filter(x=>x.startsWith('PASS')).length+'/'+ok.length);await b.close();

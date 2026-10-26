// A question in ▶ Play: asked when a slide has finished (the deck holds at its end), the answer is given and the deck then goes on to
// the next slide, never back to the start of the slide just heard; asked when the user paused mid-slide, the slide carries on.
import {chromium} from 'playwright';
const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+JSON.stringify(d).slice(0,400):''))}};
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/,r=>r.abort());await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);await p.evaluate(()=>showTab('report'));await p.waitForTimeout(500);
await p.click('#rplay');await p.waitForTimeout(1500);
const setup=()=>p.evaluate(()=>{KP.voice=false;window.kAnswer=async q=>'Noted: that one needs a little more working. I will come back to it at the end of the presentation.';window.KSTARTS=[];if(!window.kStartTimer0){window.kStartTimer0=kStartTimer;kStartTimer=function(){KSTARTS.push(KP.i);return kStartTimer0.apply(this,arguments)}}});
// 1. the slide has finished, the deck holds for a question; the question is answered; Play goes on to the next slide
await setup();const r1=await p.evaluate(async()=>{kGo(2);await new Promise(r=>setTimeout(r,400));clearTimeout(KP.timer);kStopVoice();kHold(2,true);KSTARTS.length=0;
  kAskQ('What drives the profit on cost?');for(let i=0;i<250&&KP.qa.state!=='follow';i++)await new Promise(r=>setTimeout(r,100));const st=KP.qa.state;
  kPause();await new Promise(r=>setTimeout(r,600));return{st,i:KP.i,restarts:KSTARTS.filter(x=>x===2).length,playing:KP.playing}});
ok(r1.st==='follow'&&r1.i===3&&r1.restarts===0&&r1.playing,'a question at the end of a slide: answered, then Play goes on to the next slide (not back to the start of the one just heard)',r1);
// 2. the same with no further question: the deck moves on by itself after the follow-up pause
await setup();const r2=await p.evaluate(async()=>{kGo(5);await new Promise(r=>setTimeout(r,400));clearTimeout(KP.timer);kStopVoice();kHold(5,true);KSTARTS.length=0;
  kAskQ('And the exit yield?');for(let i=0;i<200&&KP.i===5;i++)await new Promise(r=>setTimeout(r,100));return{i:KP.i,restarts:KSTARTS.filter(x=>x===5).length}});
ok(r2.i===6&&r2.restarts===0,'with no follow-up question the deck moves on to the next slide by itself',r2);
// 3. paused mid-slide by the user, a question, then Play: the same slide carries on
await setup();const r3=await p.evaluate(async()=>{kGo(8);await new Promise(r=>setTimeout(r,600));kPause();KSTARTS.length=0;
  kAskQ('Is that levered?');for(let i=0;i<250&&KP.qa.state!=='follow';i++)await new Promise(r=>setTimeout(r,100));kPause();await new Promise(r=>setTimeout(r,500));return{i:KP.i,resumed:KSTARTS.includes(8)}});
ok(r3.i===8&&r3.resumed,'paused mid-slide, a question, then Play: the same slide carries on',r3);
// 4. moving to another slide clears the "slide over" mark: a later mid-slide question does not skip a slide
await setup();const r4=await p.evaluate(async()=>{kGo(10);await new Promise(r=>setTimeout(r,300));clearTimeout(KP.timer);kHold(10,true);kGo(11);await new Promise(r=>setTimeout(r,600));kPause();
  kAskQ('One more?');for(let i=0;i<250&&KP.qa.state!=='follow';i++)await new Promise(r=>setTimeout(r,100));kPause();await new Promise(r=>setTimeout(r,500));return{i:KP.i}});
ok(r4.i===11,'after moving on by hand, a question mid-slide keeps the deck on that slide',r4);
ok(!errs.length,'no page errors',errs);await b.close();console.log(`${pass} pass, ${fail} fail`);process.exit(fail?1:0);

import {chromium} from 'playwright';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const URL=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/api/voice*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":false}'}));
await p.goto(URL);await p.waitForTimeout(2500);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
await p.evaluate(()=>{AI.keys.anthropic='sk-a';AI.keys.openai='sk-o';window.__calls=[];window.checkerAgent=async()=>({model:'c',verdicts:[],summary:''});
  window.callOne=async(pr,model,sys,msgs)=>{const u=msgs[msgs.length-1].content;__calls.push(sys.slice(0,40));
    if(/needs careful financial reasoning\. Work it out properly/.test(sys)){await new Promise(r=>setTimeout(r,1500));return{text:'To reach fifteen percent the sale price must rise about 6 percent ⟦calc: 12.3% + 6 × 0.45 = 15.0%⟧, or costs fall by 7 percent.'}}
    if(/audit the arithmetic/.test(sys))return{text:JSON.stringify({items:[{i:1,ok:true}]})};
    if(/careful financial reasoning\. Give only a short first read/.test(u))return{text:'My first read is that price matters most. I will work it out properly and come back to it at the end of the presentation.'};
    await new Promise(r=>setTimeout(r,2500));return{text:'Construction is the largest cost line, about 56 percent of the total.'}}});
await p.evaluate(()=>{showTab('report');RSEL='ic';renderReportList();renderReport()});await p.waitForTimeout(300);await p.click('#rplay');await p.waitForTimeout(1500);
// 1. the close button is always visible and closes a box with an answer in progress
await p.evaluate(()=>{KP.voice=false;kAskQ('What drives the construction cost?')});await p.waitForTimeout(400);
const vis=await p.evaluate(()=>{const x=KP.root.querySelector('.kd-qa-x'),bx=KP.root.querySelector('.kd-qa'),r=x.getBoundingClientRect(),br=bx.getBoundingClientRect();return{shown:!bx.hidden,inside:r.right<=br.right+1&&r.width>0,state:KP.qa.state}});
ok(vis.shown&&vis.inside,'the × sits inside the box while it answers: '+JSON.stringify(vis));
await p.click('.kd-qa-x');await p.waitForTimeout(300);ok(await p.evaluate(()=>KP.root.querySelector('.kd-qa').hidden&&!KP.qa.pending),'× closes it even while the answer is being worked out');
await p.waitForTimeout(3000);ok(await p.evaluate(()=>KP.root.querySelector('.kd-qa').hidden),'the dropped answer does not pop back');
// 2. a complex question: a first read now, the full answer at the end
await p.evaluate(()=>{kAskQ('What needs to change for the levered IRR to reach fifteen?');if(KP.qa.pending)kTakeQuestion(KP.i,false)});await p.waitForTimeout(1500);
const first=await p.evaluate(()=>KP.root.querySelector('.kd-qa-a').textContent);ok(/come back to it at the end/.test(first),'complex question: a first read and a promise to come back: '+first.slice(0,80));
ok(await p.evaluate(()=>KP.deferred&&KP.deferred.length===1),'the full answer is being worked out in the background');
await p.waitForTimeout(2000);ok(await p.evaluate(()=>KP.deferred[0].done&&/fifteen percent/.test(KP.deferred[0].res.text)&&KP.deferred[0].res.checked),'worked out by the deep model and its figures checked by the other');
await p.evaluate(()=>kDeliverDeferred());await p.waitForTimeout(300);const end=await p.evaluate(()=>({a:KP.root.querySelector('.kd-qa-a').textContent,st:KP.root.querySelector('.kd-qa-st').textContent,q:KP.root.querySelector('.kd-qa-q').textContent}));
console.log('END',JSON.stringify(end).slice(0,300));ok(/fifteen percent/.test(end.a)&&/checked by/.test(end.a)&&/reach fifteen/.test(end.q),'at the end it is delivered with the question restated');
await p.screenshot({path:sp+'qa_deferred.png'});
// 3. the closing line and the box size
const closeLine=await p.evaluate(()=>{const s=KP.script.segs[KP.deck.slides.length-1];return kSegText(s||[])});ok(/That brings us to the end/.test(closeLine)&&!/Committee Pack/i.test(closeLine),'closing line: '+closeLine.slice(0,60));
const w=await p.evaluate(()=>KP.root.querySelector('.kd-qa').getBoundingClientRect().width);ok(w>=700,'the box is wider ('+Math.round(w)+'px)');
ok(await p.evaluate(()=>{let q=null;for(const sc of document.querySelectorAll('script'))if(/QWIN=5000/.test(sc.textContent))q=true;return !!q}),'the end-of-slide question window is 5 s on every slide');
console.log('errors',errs);console.log(`${pass} pass, ${fail} fail`);await b.close();

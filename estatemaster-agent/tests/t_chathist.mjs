// Previous chats: in full-page mode the chat header shows 🕓 (history) and ＋ (new chat); a new chat archives the current one, an old one
// reopens and continues, a reload never duplicates an entry, a chat can be forgotten; the icons are absent in the small dock.
import {chromium} from 'playwright';import fs from 'fs';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;const base=process.argv[2]||'http://localhost:4090/?mode=readonly';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:950}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);const ev=(f,a)=>p.evaluate(f,a);const vis=id=>ev(i=>{const e=document.getElementById(i);return !!e&&getComputedStyle(e).display!=='none'},id);
await ev(()=>toggleDock(true));t(!(await vis('chatHist'))&&!(await vis('chatNew')),'small dock: no history or new-chat icon');
await ev(()=>{DOCK.full=true;renderDock()});t((await vis('chatHist'))&&(await vis('chatNew')),'full page: the history and new-chat icons show at the top of the bot');
await ev(()=>{addMsg('user','what is the levered IRR?');addMsg('agent','26.83%.');chatSave()});
await p.click('#chatNew');await p.waitForTimeout(200);let s=await ev(()=>({n:CHATHIST.length,title:CHATHIST[0]&&CHATHIST[0].title,msgs:$('#msgs').querySelectorAll('.msg.user').length}));
t(s.n===1&&/levered IRR/.test(s.title)&&s.msgs===0,'＋ starts a fresh chat and keeps the old one in the history: '+JSON.stringify(s));
await ev(()=>{addMsg('user','second question');addMsg('agent','ok');chatSave()});await p.click('#chatHist');await p.waitForTimeout(200);
s=await ev(()=>({shown:!$('#chatHistPanel').hidden,rows:[...document.querySelectorAll('#chatHistPanel .ch-row b')].map(e=>e.textContent)}));t(s.shown&&s.rows.length===2&&s.rows.includes('what is the levered IRR?'),'🕓 lists both chats: '+JSON.stringify(s.rows));
await p.click('#chatHistPanel [data-chat]:not(.cur)');await p.waitForTimeout(200);s=await ev(()=>({hidden:$('#chatHistPanel').hidden,txt:$('#msgs').innerText.slice(0,200),n:CHATHIST.length}));
t(s.hidden&&/what is the levered IRR\?/.test(s.txt)&&s.n===2,'an old chat reopens in the box and can be continued: '+s.txt.replace(/\n/g,' | ').slice(0,80));
await p.reload();await p.waitForTimeout(1500);await ev(()=>{toggleDock(true);addMsg('user','third');addMsg('agent','x');chatSave()});s=await ev(()=>({n:CHATHIST.length,cur:CHATHIST.find(c=>c.id===$('#msgs').dataset.chatId),q:$('#msgs').querySelectorAll('.msg.user').length}));
t(s.n===2&&s.cur&&s.cur.n===2&&s.q===2,'after a reload the open chat keeps its history entry (no duplicate): '+JSON.stringify({n:s.n,q:s.q}));
await ev(()=>{DOCK.full=true;renderDock()});await p.click('#chatHist');await p.click('#chatHistPanel [data-chatdel]');await p.waitForTimeout(200);s=await ev(()=>({n:CHATHIST.length,stored:JSON.parse(localStorage.getItem('em_chathist')).length}));t(s.n===1&&s.stored===1,'× forgets a chat, in memory and in storage');
await p.screenshot({path:sp+'../chathist.png'});t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();

// The presenter's voice is ElevenLabs. A failed voice check (expired sign-in, network blip, server error) must not leave the
// deck on the browser's robot voice for good: the reason is shown, and the next check switches back to ElevenLabs.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
let mode='401';
await p.route('**/api/voice**',r=>{const m=r.request().method();if(m==='GET'){if(mode==='401')return r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Sign in at bohiotech.com/demo'})});if(mode==='500')return r.fulfill({status:500,contentType:'application/json',body:'{}'});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,voice:'v1',model:'m'})})}
  return mode==='ok'?r.fulfill({status:200,contentType:'audio/mpeg',body:Buffer.from([0xff,0xfb,0x90,0x00])}):r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Sign in at bohiotech.com/demo'})})});
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.waitForTimeout(1500);
const ok=[];const t=(c,m)=>ok.push((c?'PASS':'FAIL')+' | '+m);
let r=await p.evaluate(async()=>{const m=await kVoiceCheck();return{m,err:KVOICE.err,bar:!!$('#soBar')}});
t(r.m==='browser'&&/sign-in has expired/.test(r.err||'')&&r.bar,'expired sign-in: the reason is shown and a sign-in banner appears: '+r.err);
mode='500';r=await p.evaluate(async()=>{const m=await kVoiceCheck();return{m,err:KVOICE.err}});
t(r.m==='browser'&&/could not be reached \(HTTP 500\)/.test(r.err||'')&&/tried again/.test(r.err||''),'server error: retried, reason shown: '+r.err);
mode='ok';r=await p.evaluate(async()=>{const m=await kVoiceCheck();return{m,err:KVOICE.err}});
t(r.m==='eleven'&&!r.err,'the next check switches back to ElevenLabs and clears the note: '+JSON.stringify(r));
r=await p.evaluate(async()=>{const m=await kVoiceCheck();return m});t(r==='eleven','ElevenLabs stays on once confirmed');
mode='401';r=await p.evaluate(async()=>{$('#soBar')&&$('#soBar').remove();const c=await kVoiceClip('Hello there, this is a test of the voice.');return{c,err:KVOICE.err,bar:!!$('#soBar')}});
t(r.c===null&&/sign-in has expired/.test(r.err||'')&&r.bar,'a clip refused by the sign-in gate says so plainly: '+r.err);
t(!errs.length,'no page errors '+errs.join(';'));console.log(ok.join('\n'));await b.close();

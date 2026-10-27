// The PowerPoint export is the deck as the preview shows it: one full-slide picture per slide taken from the player itself (so the
// fonts, colours and graphics are the preview's), the narration in the notes, and the old editable build kept as its own button.
import {chromium} from 'playwright';import {spawn} from 'child_process';import path from 'path';import {fileURLToPath} from 'url';import {execSync} from 'child_process';import fs from 'fs';import os from 'os';
const HERE=path.dirname(fileURLToPath(import.meta.url)),APP=path.join(HERE,'..'),JD=path.join(APP,'dist/jadwa-readonly');
if(!fs.existsSync(JD))execSync('python3 tools/build_options.py',{cwd:APP,stdio:'ignore'});
let pass=0,fail=0;const ok=(c,m,d)=>{if(c){pass++;console.log('PASS | '+m)}else{fail++;console.log('FAIL | '+m+(d!==undefined?' → '+JSON.stringify(d).slice(0,300):''))}};
// the built edition is served with the app's vendor/ beside it, as the deploy does
if(!fs.existsSync(path.join(JD,'vendor')))fs.symlinkSync(path.join(APP,'vendor'),path.join(JD,'vendor'));
const srv=spawn('python3',['-m','http.server','4097','-d',JD],{stdio:'ignore'});await new Promise(r=>setTimeout(r,1500));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1440,height:810},acceptDownloads:true});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.g/,r=>r.abort());await p.route('**/api/**',r=>r.fulfill({status:404,body:''}));
try{
await p.goto('http://localhost:4097/');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.evaluate(()=>showTab('report'));await p.waitForTimeout(500);
ok(await p.evaluate(()=>!!document.querySelector('#rpptx')&&!!document.querySelector('#rpptxe')),'the report offers the exact PowerPoint and, beside it, the editable one');
await p.addScriptTag({path:path.join(APP,'vendor/pptxgen-3.12.0.bundle.js')});
await p.evaluate(()=>{window.__pp=null;const w=PptxGenJS.prototype.writeFile;PptxGenJS.prototype.writeFile=async function(o){window.__pp=await this.write({outputType:'base64'});return 'x'}});
await p.click('#rpptx');
await p.waitForFunction(()=>window.__pp,null,{timeout:120000});
const b64=await p.evaluate(()=>window.__pp);const f=path.join(os.tmpdir(),'t_pptxexact.pptx');fs.writeFileSync(f,Buffer.from(b64,'base64'));
const list=execSync(`unzip -l ${f}`).toString();const slides=(list.match(/ppt\/slides\/slide\d+\.xml/g)||[]).length,media=(list.match(/ppt\/media\/[^\s]+\.(png|jpg|jpeg)/g)||[]).length,notes=(list.match(/ppt\/notesSlides\/notesSlide\d+\.xml/g)||[]).length;
const n=await p.evaluate(()=>buildDeck(RSEL).slides.length);
ok(slides===n&&slides>3,'one slide per deck slide',{slides,n});
ok(media>=n,'each slide is a picture taken from the preview',{media,n});
const x=execSync(`unzip -p ${f} 'ppt/slides/slide2.xml'`).toString();
ok(!/Montserrat/.test(x)&&/<p:pic>/.test(x),'slide 2 is a full-slide picture, no KINAN-font text',x.slice(0,200));
ok(notes>=n,'the narration is in the speaker notes',{notes});
const first=execSync(`unzip -l ${f}`).toString().match(/(\d+)\s+\S+\s+\S+\s+ppt\/media\/\S+/);ok(first&&+first[1]>5000,'the pictures are not blank',first&&first[1]);
}catch(e){ok(false,'export ran',String(e).slice(0,300))}
// the PDF is the page printed: backgrounds and graphics kept, no half-played animation, no clipped report
{const h=fs.readFileSync(path.join(JD,'index.html'),'utf8'),m=h.match(/@media print\{\*\{[^\n]*?\.report\{contain:none[^\n]*?\}/);
 ok(m&&/print-color-adjust:exact/.test(m[0])&&/animation:none!important/.test(m[0])&&/overflow:visible!important/.test(m[0]),'the printed report keeps its colours and graphics, shows every animated part finished and is not clipped')}
ok(!errs.length,'no page errors',errs);await b.close();srv.kill();try{if(fs.lstatSync(path.join(JD,'vendor')).isSymbolicLink())fs.unlinkSync(path.join(JD,'vendor'))}catch(e){}
console.log(`${pass} pass, ${fail} fail`);process.exit(fail?1:0);

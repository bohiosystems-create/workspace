import {chromium} from 'playwright';import fs from 'fs';const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1100,height:700}});p.on('pageerror',e=>console.log('ERR',e.message));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(sp+'package/dist/xlsx.full.min.js')}));
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(1500);
await p.evaluate(()=>{const d=document.createElement('div');d.id='_c';d.style.cssText='position:fixed;inset:0;background:#fff;z-index:99999;padding:20px;overflow:auto';d.innerHTML=chartCard(DS_CHARTS.delivery_record()[0],{source:'dummy data'});document.body.appendChild(d);chartCardAnimate(d)});
await p.waitForTimeout(2500);await p.screenshot({path:'/tmp/claude-0/-home-user-workspace/c7e8f42c-9ed0-5ba7-9852-d8a131185935/scratchpad/chart_before.png'});await b.close();

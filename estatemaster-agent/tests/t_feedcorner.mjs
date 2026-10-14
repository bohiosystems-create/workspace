import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:1000}});
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(1500);await p.evaluate(()=>showTab('appr'));await p.waitForTimeout(500);
const r=await p.evaluate(()=>{const f=document.querySelector('.feed'),it=f&&f.querySelector('.feed-item'),c=document.querySelector('.card');const R=e=>e?getComputedStyle(e).borderTopLeftRadius:'none';return{feed:R(f),item:R(it),card:R(c)}});
console.log((r.feed===r.card&&r.item==='0px'?'PASS':'FAIL')+' | feed box radius matches the cards, rows flush: '+JSON.stringify(r));
await p.screenshot({path:'feedcorner.png',clip:{x:0,y:300,width:1500,height:500}});await b.close();

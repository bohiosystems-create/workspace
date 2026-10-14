import {chromium} from 'playwright';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});
await p.goto('http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
await p.hover('#projRail .pr-hot');await p.waitForTimeout(400);await p.hover('#prNav .pr-nav-i[data-gtab="report"]');await p.waitForTimeout(400);
console.log('subnav visible',await p.locator('#prNav .pr-subnav').isVisible());
await p.screenshot({path:sp+'rail_hover.png',clip:{x:0,y:0,width:420,height:520}});
await p.click('#prNav .pr-nav-s[data-rpwin="rdModal"]');await p.waitForTimeout(400);console.log('designer window',await p.locator('#rdModal.on').count());
await b.close();

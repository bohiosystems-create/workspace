import {chromium} from 'playwright';
const sp=new globalThis.URL('./fixtures/',import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1300,height:900}});
await p.goto(process.argv[2]||'http://localhost:4090/?mode=readonly');await p.waitForTimeout(2500);
await p.hover('#projRail .pr-hot');await p.waitForTimeout(400);await p.hover('#prNav .pr-nav-i[data-gtab="report"]');await p.waitForTimeout(400);
const sv=await p.locator('#prNav .pr-subnav').isVisible();console.log((sv?'PASS':'FAIL')+' | hovering Reports in the side menu shows its sub-menu');
await p.screenshot({path:sp+'rail_hover.png',clip:{x:0,y:0,width:420,height:520}});
await p.click('#prNav .pr-nav-s[data-rpwin="rdModal"]');await p.waitForTimeout(400);const dw=await p.locator('#rdModal.on').count();console.log((dw===1?'PASS':'FAIL')+' | the report designer opens from the sub-menu ('+dw+')');
await b.close();

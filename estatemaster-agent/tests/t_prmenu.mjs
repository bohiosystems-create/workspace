// The model menu (Open / Delete) closes when the left menu retracts.
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});const p=await b.newPage({viewport:{width:1500,height:900}});await p.goto('http://localhost:4090/?mode=readonly');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1500);
await p.mouse.move(2,400);await p.waitForTimeout(700);const it=p.locator('#projRail [data-proj]').first();await it.click({button:'right'});await p.waitForTimeout(300);
const on1=await p.evaluate(()=>$('#prMenu').classList.contains('on'));await p.mouse.move(900,500);await p.waitForTimeout(1200);const on2=await p.evaluate(()=>$('#prMenu').classList.contains('on'));
console.log((on1&&!on2?'PASS':'FAIL')+' | the menu opens on right-click ('+on1+') and closes once the left menu retracts ('+!on2+')');await b.close();

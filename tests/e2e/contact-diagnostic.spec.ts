import {test,expect} from '@playwright/test';
test('real movement pending cut is visible with cause, cell and fractional event time in debug mode',async({page})=>{
 await page.goto('http://127.0.0.1:5173/tests/fixtures/contact-diagnostic.html?debug=1');
 await expect(page.locator('#death')).toContainText('생성 중인 선이 상대와 겹쳤어요');
 await expect(page.locator('#death')).toContainText('PENDING_TRAIL_CONTACT');await expect(page.locator('#death')).toContainText('cell 612');await expect(page.locator('#death')).toContainText('t 19.249');
 await page.screenshot({path:'evidence/pending-contact-debug.png'});
 await page.goto('http://127.0.0.1:5173/tests/fixtures/contact-diagnostic.html');await expect(page.locator('#death')).toContainText('생성 중인 선이 상대와 겹쳤어요');await expect(page.locator('#death')).not.toContainText('PENDING_TRAIL_CONTACT');
});
test('debug practice exposes bounded death and independent shadow measurements',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));await page.goto('http://127.0.0.1:5174/?debug=1');
 await page.getByTestId('nickname').fill('진단');await page.getByTestId('practice').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_DIAGNOSTICS__.get()?.decisionCount??0)).toBeGreaterThan(0);
 const data=await page.evaluate(()=>(window as any).__HEXHOLD_DIAGNOSTICS__.get());expect(data.seed).toBeGreaterThanOrEqual(0);expect(data.deaths.length).toBeLessThanOrEqual(16);expect(data.missed.length).toBeLessThanOrEqual(64);
 await page.goto('http://127.0.0.1:5174');expect(await page.evaluate(()=>Object.hasOwn(window,'__HEXHOLD_DIAGNOSTICS__'))).toBe(false);
});

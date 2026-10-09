import {test,expect} from '@playwright/test';
test('practice HUD exposes 13 bots, real reasons, selection and camera follow, and tears down on exit',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&experimentSeed=19');await page.getByTestId('nickname').fill('밤산책');await page.getByTestId('practice').click();
 const hud=page.locator('#bot-debug-hud');await expect(hud).toBeVisible();await expect(hud.locator('div>button')).toHaveCount(13);await expect(hud.locator('pre')).toContainText('선택:');
 const snapshot=await page.evaluate(()=>{const p=(window as any).__HEXHOLD_TEST__.getPractice();p.setPaused(true);return p.botDiagnostics();});
 expect(snapshot.bots).toHaveLength(13);expect(snapshot.bots.some((b:any)=>b.nickname==='밤산책')).toBe(false);
 const counts=Object.values(snapshot.bots.reduce((s:any,b:any)=>{s[b.personality]=(s[b.personality]??0)+1;return s;},{})).sort();expect(counts).toEqual([3,3,3,4]);
 expect(snapshot.bots.some((b:any)=>b.identity.active===false)).toBe(true);await expect(hud).toContainText('비활성');
 await hud.locator('div>button').nth(4).click();await expect(hud.locator('pre')).toContainText('#5 ');
 await hud.getByRole('button',{name:'선택 봇 따라보기',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().isBotDebugFollowing())).toBe(true);
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.enabled())).toBe(false);
 await page.screenshot({path:'evidence/bot-phase01/hud.png'});
 await hud.getByRole('button',{name:'내 화면으로',exact:true}).click();expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().isBotDebugFollowing())).toBe(false);
 await hud.getByRole('button',{name:'접기',exact:true}).click();await expect(hud.locator('pre')).toBeHidden();await hud.getByRole('button',{name:'펼치기',exact:true}).click();await expect(hud.locator('pre')).toBeVisible();
 await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await expect(hud).toBeHidden();
 expect(errors).toEqual([]);
});
test('debug HUD stays absent without the flag and on production even with debug=1',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 for(const url of ['/?experimentSeed=19','http://127.0.0.1:5312/?debug=1&experimentSeed=19']){
  await page.goto(url);await page.getByTestId('nickname').fill('검증');await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#bot-debug-hud')).toHaveCount(0);
  expect(await page.evaluate(()=>('__HEXHOLD_DIAGNOSTICS__' in window))).toBe(false);
 }
});

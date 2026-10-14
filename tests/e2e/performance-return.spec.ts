import {test,expect} from '@playwright/test';

test('unchanged settings pauses preserve the live interpolation clock and close the game menu on steering',async({browser})=>{
 const context=await browser.newContext({baseURL:process.env.HEXHOLD_TEST_CLIENT_URL??'http://127.0.0.1:5174',viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/?perf=autoplay&perfSeed=137&perfRoundSeconds=900&perfRounds=1');
  await page.waitForFunction(()=>(window as any).__HEXHOLD_TEST__?.getView()?.tick>10);
  for(let i=0;i<3;i++){
   await page.locator('#settings').click();const tick=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().tick);
   await page.waitForTimeout(500);expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().tick)).toBe(tick);
   await page.locator('#settings-close').click();await page.waitForFunction(t=>(window as any).__HEXHOLD_TEST__.getView().tick>t+3,tick);
   const timing=await page.evaluate(()=>{const s=(window as any).__HEXHOLD_TEST__.getScene(),p=s.presentation;return{fps:s.game.loop.fpsLimit,live:s.renderLive(),paused:p.localPausedAt,resumePending:p.localResumePending,age:performance.now()-p.frames.at(-1).at,step:1000/s.view.config.simulationHz};});
   expect(timing.live).toBe(true);expect(timing.fps).toBe(60);expect(timing.paused).toBeNull();expect(timing.resumePending).toBe(false);
   expect(timing.age).toBeLessThan(timing.step*3);
  }
  await page.goto('/?experimentSeed=4&experimentSlots=16');await page.getByTestId('practice').click();await expect(page.locator('#joystick')).toBeVisible();
  const before=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection());
  await page.locator('#game-tools-toggle').click();await expect(page.locator('#game-tools')).toBeVisible();
  await expect(page.locator('#fullscreen-toggle')).toHaveCount(0);
  const box=(await page.locator('#joystick').boundingBox())!;
  const sign=before.y<0?1:-1;await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2+sign*box.height*.35);
  await expect(page.locator('#game-tools')).toBeHidden();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection())).not.toEqual(before);expect(errors).toEqual([]);
 }finally{await context.close();}
});

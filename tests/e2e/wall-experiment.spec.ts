import {test,expect} from '@playwright/test';
const sizes=[{width:844,height:390},{width:640,height:320},{width:568,height:320}];
test('same-input comparison, actual mobile drill and complete practice',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const size of sizes){
  await page.setViewportSize(size);await page.goto('/docs/wall-experiment/');
  await expect.poll(()=>page.evaluate(()=>(window as any).__WALL_LAB__?.get()[1].tick)).toBe(60);
  const result=await page.evaluate(()=>(window as any).__WALL_LAB__.get());expect(result[0].reason).toBe('WALL_HIT');expect(result[1].life).toBe('ALIVE');
  expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:'.local/wall-compare-'+size.width+'.png'});
  expect(result[1].margin).toBeCloseTo(Math.sqrt(3)*32*.25);expect('budget' in result[1]).toBe(false);
  await page.locator('#scenario').selectOption('push');await expect.poll(()=>page.evaluate(()=>(window as any).__WALL_LAB__.get()[1].reason)).toBe('WALL_HIT');
  const push=await page.evaluate(()=>(window as any).__WALL_LAB__.get());expect((push[1].deathTick-push[0].deathTick)/30).toBeCloseTo(.25/4.2,4);
  await page.goto('/docs/wall-experiment/?play=1&variant=margin');
  await expect.poll(()=>page.evaluate(()=>(window as any).__WALL_DRILL__?.scene().markerState().length)).toBe(16);
  await expect.poll(()=>page.evaluate(()=>(window as any).__WALL_DRILL__?.scene().wallVisualState().edges)).toBeGreaterThan(0);
  await page.screenshot({path:'.local/wall-drill-'+size.width+'.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);
  const rect=await page.locator('#replay').boundingBox();expect(rect!.y+rect!.height).toBeLessThanOrEqual(size.height);
  await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#replay')!.click();(window as any).__WALL_DRILL__.input(-1,0);});
  await page.waitForTimeout(500);expect(await page.evaluate(()=>(window as any).__WALL_DRILL__.get().participants[0].lifeState)).toBe('ALIVE');
  await page.locator('#drill-reset').click();const stick=await page.locator('#joystick').boundingBox();
  await page.touchscreen.tap(stick!.x+8,stick!.y+stick!.height/2);
  await expect.poll(()=>page.evaluate(()=>(window as any).__WALL_DRILL__.getInput().x)).toBe(-1);await page.locator('#replay').click();await expect.poll(()=>page.evaluate(()=>(window as any).__WALL_DRILL__.get().participants[0].targetDirection?.x)).toBe(-1);
  await page.waitForTimeout(400);expect(await page.evaluate(()=>(window as any).__WALL_DRILL__.get().participants[0].lifeState)).toBe('ALIVE');
  // A reused Graphics object remains bounded across variant changes/resets.
  for(let i=0;i<3;i++){await page.locator('#scenario').selectOption('strict');await page.locator('#scenario').selectOption('margin');}
  expect(await page.evaluate(()=>(window as any).__WALL_DRILL__.scene().wallVisualState().graphics)).toBe(2);
 }
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?experimentSeed=4');await page.getByTestId('practice').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__?.getMarkerState().length)).toBe(16);
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().wallVisualState().enabled)).toBe(true);
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().owners.length)).toBe(9577);
 await page.getByTestId('leave').click();await page.goto('/?experimentWall=strict&experimentSeed=4');await page.getByTestId('practice').click();
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().wallVisualState().enabled)).toBe(false);expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().wallVisualState().highlight)).toBe(true);
 expect(errors).toEqual([]);
});

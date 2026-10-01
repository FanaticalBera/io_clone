import {completeClassic} from '../mode-fixture.js';
import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {until} from '../server/helpers.js';
test('T29/T32 browser visibility, missing result event and server restart recover actual current state',async({browser})=>{
 process.env.NODE_ENV='test';let now=0;
 let server=createGameServer({now:()=>now,autoStart:false,config:{roundSeconds:3}});
 await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));const page=await context.newPage();
 const visibility=async(hidden:boolean)=>page.evaluate(hidden=>{Object.defineProperty(document,'hidden',{configurable:true,value:hidden});document.dispatchEvent(new Event('visibilitychange'));},hidden);
 try{
 await page.goto('http://127.0.0.1:5174');await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();
 await visibility(true);const tick=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().tick);await page.waitForTimeout(1200);
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().tick)).toBe(tick);
 // Compare elapsed browser time so slow automation does not look like simulation catch-up.
 const resumed=await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));return {tick:(window as any).__HEXHOLD_TEST__.getView().tick,at:performance.now()};});
 expect(resumed.tick).toBe(tick);await page.waitForTimeout(100);
 const afterResume=await page.evaluate(()=>({tick:(window as any).__HEXHOLD_TEST__.getView().tick,at:performance.now()}));
 expect(afterResume.tick-tick).toBeLessThanOrEqual(Math.ceil((afterResume.at-resumed.at)*30/1000)+2);
 await page.getByTestId('leave').click();await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();now=3000;server.loop.pump();await expect(page.locator('#hud')).toBeVisible();
 const room=server.rooms.rooms.values().next().value!,s=[...server.sessions.sessions.values()][0];await visibility(true);await until(()=>s.background);
 for(let i=0;i<3;i++){now+=100;server.loop.pump();}expect(room.match!.tick).toBeGreaterThan(0);
 await visibility(false);await until(()=>!s.background);await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.enabled())).toBe(true);
 // Lose match:result on a genuine closed transport, then recover the durable RESULTS view.
 await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.transportClose(false));await until(()=>!s.connected);
 completeClassic(room.match!);while(room.phase!=='RESULTS'){now+=100;server.loop.pump();}
 await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.reconnect());await expect(page.locator('#results')).toBeVisible();
 const token=await page.evaluate(()=>sessionStorage.getItem('hexhold.session'));
 await server.close();server=createGameServer({now:()=>now,autoStart:false});
 await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.reconnect());await expect(page.locator('#notice')).toContainText('복구 시간이 지났');
 expect(await page.evaluate(()=>sessionStorage.getItem('hexhold.session'))).toBe(token);
 await page.locator('#retry').click();await expect(page.locator('#room-panel')).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('hexhold.session'))).not.toBe(token);
 }finally{await context.close();await server.close();}
});

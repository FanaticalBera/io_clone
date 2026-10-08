import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {completeClassic} from '../mode-fixture.js';
import {until} from '../server/helpers.js';
test('Classic is the only menu mode and practice has no mode HUD',async({page})=>{
 await page.goto('http://127.0.0.1:5174');await page.evaluate(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await expect(page.locator('#mode-name')).toHaveText('클래식');await expect(page.locator('#mode-prev,#mode-next')).toHaveCount(0);
 await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('.time-block,#timer-label,#timer,#hold-detail')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().gameMode)).toEqual({id:'classic'});await expect(page.locator('#score')).toContainText('%');
 await page.locator('#game-tools-toggle').click();await page.locator('#ranking-toggle').click();await expect(page.locator('#leaderboard')).toBeVisible();
 await expect(page.locator('#minimap')).toBeVisible();await expect(page.locator('#leaderboard')).toBeHidden();
 await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await expect(page.locator('#mode-name')).toHaveText('클래식');
});
test('mobile portrait and landscape retain Classic score and remove the black mode window',async({browser})=>{
 for(const viewport of [{width:393,height:852},{width:852,height:393}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});try{
   await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));const page=await context.newPage();await page.goto('http://127.0.0.1:5174');
   await expect(page.locator('#mode-prev,#mode-next')).toHaveCount(0);await page.getByTestId('practice').click();await expect(page.locator('#score')).toBeVisible();await expect(page.locator('.time-block,#timer')).toHaveCount(0);
   await expect(page.locator('#self-rank')).toBeVisible();await expect(page.locator('#kill-count')).toBeVisible();
   await page.screenshot({path:'.local/classic-only-'+viewport.width+'.png'});
  }finally{await context.close();}
 }
});
test('Classic friend room recovers results and starts the next round without a mode HUD',async({browser})=>{
 process.env.NODE_ENV='test';let now=0;const server=createGameServer({autoStart:false,now:()=>now});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');await page.getByTestId('nickname').fill('PLAYER');await page.getByTestId('create').click();await expect(page.locator('#room-game-mode')).toHaveText('클래식 · 100% 점령');
  await page.getByTestId('start').click();await until(()=>[...server.rooms.rooms.values()][0]?.phase==='COUNTDOWN');now=3000;server.loop.pump();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('.time-block')).toHaveCount(0);
  const room=[...server.rooms.rooms.values()][0],m=room.match!,session=[...server.sessions.sessions.values()][0];await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.transportClose(false));await until(()=>!session.connected);
  completeClassic(m);now+=100;server.loop.pump();expect(room.phase).toBe('RESULTS');await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.reconnect());
  await expect(page.locator('#run-results')).toBeVisible();await expect(page.locator('#run-title')).toHaveText('완전 점령!');await page.locator('#run-retry').click();await until(()=>room.phase==='COUNTDOWN');
  now+=3000;server.loop.pump();await expect(page.locator('#run-results')).toBeHidden();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('.time-block,#timer')).toHaveCount(0);expect(room.match!.matchId).not.toBe(m.matchId);
 }finally{await context.close();await server.close();}
});

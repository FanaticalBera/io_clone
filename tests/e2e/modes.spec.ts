import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {completeClassic} from '../mode-fixture.js';
import {setOwner} from '../../src/shared/territory.js';
import {until} from '../server/helpers.js';
test('mode arrows, mouse drag and keyboard select the practice rules without another page',async({page})=>{
 await page.goto('http://127.0.0.1:5174');await page.evaluate(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await expect(page.locator('#mode-name')).toHaveText('CLASSIC');await expect(page.locator('#mode-rule')).toHaveText('100% 점령');
 await page.locator('#mode-next').click();await expect(page.locator('#mode-name')).toHaveText('HOLD');await expect(page.locator('#mode-rule')).toHaveText('50% · 10초 유지');
 const box=(await page.locator('#mode-slide').boundingBox())!;await page.mouse.move(box.x+box.width*.6,box.y+20);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-70,box.y+20,{steps:5});await page.mouse.up();await expect(page.locator('#mode-name')).toHaveText('CLASSIC');
 await page.locator('#mode-slide').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#mode-name')).toHaveText('HOLD');
 await page.getByTestId('practice').click();await expect(page.locator('#timer-label')).toHaveText('HOLD');await expect(page.locator('#timer')).toHaveText('50%');await expect(page.locator('#hold-detail')).toHaveText('10초 유지하면 승리');
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().gameMode)).toEqual({id:'hold',targetPercent:50,holdSeconds:10});
 const board=(await page.locator('#leaderboard').boundingBox())!,mini=(await page.locator('#minimap').boundingBox())!;expect(board.y+board.height+4).toBeLessThanOrEqual(mini.y);
 await page.getByTestId('leave').click();await expect(page.locator('#mode-name')).toHaveText('HOLD');await page.screenshot({path:'evidence/modes-menu-hold.png'});
});
test('touch swipe selects a mode while vertical gestures retain menu scrolling',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');const cdp=await context.newCDPSession(page),box=(await page.locator('#mode-slide').boundingBox())!,x=box.x+box.width*.75,y=box.y+20;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#mode-name')).toHaveText('HOLD');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-80,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#mode-name')).toHaveText('HOLD');
  await page.screenshot({path:'evidence/modes-menu-touch.png'});
 }finally{await context.close();}
});
test('server Hold countdown cancels, restarts and survives results reconnect and next round in the browser',async({browser})=>{
 process.env.NODE_ENV='test';let now=0;const server=createGameServer({autoStart:false,now:()=>now,modeSettings:{hold:{holdSeconds:1}},initializeMatch:completeClassic});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');await page.locator('#mode-next').click();await page.getByTestId('nickname').fill('HOLDER');await page.getByTestId('create').click();await expect(page.locator('#room-game-mode')).toHaveText('HOLD · 50% · 1초 유지');expect(await page.locator('#room-panel select').count()).toBe(0);
  await page.getByTestId('start').click();now=3000;server.loop.pump();await expect(page.locator('#hud')).toBeVisible();const room=[...server.rooms.rooms.values()][0],m=room.match!,winner=m.participants.find(p=>p.lifeState==='ALIVE')!,min=Math.ceil(m.map.cells.length*.5),cells=m.map.cells.filter(c=>c.id!==winner.cellId);
  for(const c of cells.slice(0,m.map.cells.length-min))setOwner(m,c.id,0);
  now+=100;server.loop.pump();server.loop.publishSnapshot(room,false,true);await expect(page.locator('#timer-label')).toHaveText('HOLDER DOMINATING');await expect(page.locator('#timer')).toHaveText('0.9');await expect(page.locator('#score')).toHaveText('50.0%');
  await page.screenshot({path:'evidence/modes-hold-countdown.png'});
  setOwner(m,cells.at(-1)!.id,0);now+=100;server.loop.pump();server.loop.publishSnapshot(room,false,true);await expect(page.locator('#timer-label')).toHaveText('HOLD');await expect(page.locator('#hold-detail')).toHaveText('1초 유지하면 승리');
  setOwner(m,cells.at(-1)!.id,winner.slot+1);now+=100;server.loop.pump();server.loop.publishSnapshot(room,false,true);await expect(page.locator('#timer-label')).toHaveText('HOLDER DOMINATING');await expect(page.locator('#timer')).toHaveText('0.9');
  const session=[...server.sessions.sessions.values()][0];await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.transportClose(false));await until(()=>!session.connected);
  for(let i=0;i<10&&room.phase!=='RESULTS';i++){now+=100;server.loop.pump();}expect(room.phase).toBe('RESULTS');
  await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.reconnect());await expect(page.locator('#results')).toBeVisible();await expect(page.locator('#result-mode')).toHaveText('HOLD · 50% · 1초 유지');await expect(page.locator('#winner-result')).toHaveText('HOLDER 승리!');await expect(page.locator('#personal-result')).toContainText('처치 0');
  // Background RETURN may capture extra cells. Recovery must display the final server result.
  const displayed=Number((await page.locator('#personal-result').textContent())!.match(/([\d.]+)%/)![1]),actual=m.results!.find(p=>p.participantId===winner.participantId)!.territory*100/m.map.cells.length;
  expect(displayed).toBeLessThanOrEqual(actual);expect(actual-displayed).toBeLessThan(.1);
  await page.screenshot({path:'evidence/modes-hold-results.png'});
  const previous=m.matchId;now+=7000;server.loop.pump();now+=3000;server.loop.pump();await expect(page.locator('#results')).toBeHidden();await expect(page.locator('#timer-label')).toHaveText('HOLD');expect(room.match!.matchId).not.toBe(previous);expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().gameMode)).toEqual({id:'hold',targetPercent:50,holdSeconds:1});
 }finally{await context.close();await server.close();}
});

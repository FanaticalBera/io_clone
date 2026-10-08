import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {completeClassic} from '../mode-fixture.js';
test('settings save across reloads and Classic 100% produces the real server victory popup',async({page})=>{
 process.env.NODE_ENV='test';let now=0;const server=createGameServer({autoStart:false,now:()=>now,initializeMatch:completeClassic});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 try{
  await page.goto('http://127.0.0.1:5174');await page.evaluate(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
  await page.getByRole('button',{name:'환경설정',exact:true}).click();await page.locator('#controls-drag').check();await page.locator('#kill-vibration').uncheck();await page.locator('#settings-close').click();await page.reload();
  await page.locator('#settings').click();await expect(page.locator('#controls-drag')).toBeChecked();await expect(page.locator('#kill-vibration')).not.toBeChecked();await expect(page.locator('#vibration-test')).toBeDisabled();await page.locator('#settings-close').click();
  await page.getByTestId('nickname').fill('브로');await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();now=3000;server.loop.pump();now+=100;server.loop.pump();
  await expect(page.locator('#results')).toBeVisible();await expect(page.locator('#winner-result')).toHaveText('브로 승리!');await expect(page.locator('#result-mode')).toHaveText('클래식 · 100% 점령');await expect(page.locator('#personal-result')).toContainText('100.0%');expect([...server.rooms.rooms.values()][0].match!.outcome?.reason).toBe('FULL_CAPTURE');
  await page.screenshot({path:'evidence/classic-victory-popup.png'});
 }finally{await server.close();}
});
test('mobile swipe displacement retains direction and works in practice and online',async({browser})=>{
 const server=createGameServer({config:{countdownSeconds:.03},seed:()=>4});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');await page.locator('#settings').click();await page.locator('#controls-drag').check();await page.screenshot({path:'evidence/mobile-swipe-settings-2026-10-02.png'});await page.locator('#settings-close').click();await page.getByTestId('practice').click();await expect(page.locator('#joystick')).toBeHidden();
  const cdp=await context.newCDPSession(page),send=(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',touchPoints:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints}),direction=()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection());
  const before=await direction();await send('touchStart',[{x:180,y:500,id:1}]);await send('touchMove',[{x:183,y:500,id:1}]);expect(await direction()).toEqual(before);
  await send('touchStart',[{x:183,y:500,id:1},{x:230,y:480,id:2}]);await send('touchMove',[{x:180,y:455,id:1},{x:230,y:550,id:2}]);await expect.poll(direction).toEqual({x:0,y:-1});const up=await direction();await send('touchEnd',[{x:230,y:550,id:2}]);await send('touchMove',[{x:190,y:550,id:2}]);await send('touchEnd',[]);expect(await direction()).toEqual(up);
  await send('touchStart',[{x:180,y:500,id:1}]);await send('touchMove',[{x:135,y:500,id:1}]);await expect.poll(direction).toEqual({x:-1,y:0});await send('touchCancel',[]);const left=await direction();
  await page.locator('#settings').click();expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.enabled())).toBe(false);const pausedTick=await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));return (window as any).__HEXHOLD_TEST__.getView().tick;});await page.waitForTimeout(120);expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().tick)).toBe(pausedTick);await page.keyboard.press('ArrowRight');expect(await direction()).toEqual(left);await page.locator('#controls-joystick').check();await page.locator('#settings-close').click();await expect(page.locator('#joystick')).toBeVisible();
  await page.locator('#settings').click();await page.locator('#controls-drag').check();await page.locator('#settings-close').click();await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#joystick')).toBeHidden();
  const pos=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().participants.find((p:any)=>p.kind==='HUMAN').position),inward=Math.abs(pos.x)>Math.abs(pos.y)?{x:pos.x>0?-1:1,y:0}:{x:0,y:pos.y>0?-1:1};
  await send('touchStart',[{x:180,y:500,id:1}]);await send('touchMove',[{x:180+45*inward.x,y:500+45*inward.y,id:1}]);await expect.poll(direction).toEqual(inward);await send('touchEnd',[]);const goal=await direction();await expect.poll(()=>[...server.rooms.rooms.values()][0].match?.participants.find(p=>p.kind==='HUMAN')?.direction).toEqual(goal);
  await page.locator('#settings').click();await page.locator('#settings-close').click();await page.setViewportSize({width:844,height:390});expect(await direction()).toEqual(goal);
 }finally{await context.close();await server.close();}
});
test('confirmed kills and deaths vibrate once; replay, reset, off and unsupported API do not',async({browser})=>{
 const context=await browser.newContext({isMobile:true,hasTouch:true});await context.addInitScript(()=>{Object.assign(window,{vibrations:[]});Object.defineProperty(navigator,'vibrate',{configurable:true,writable:true,value:(pattern:number|number[])=>{(window as any).vibrations.push(pattern);return true;}});});
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/tests/fixtures/combat.html');await page.waitForFunction(()=>!!(window as any).fixture?.scene.combatState());await page.locator('#settings').click();await page.locator('#vibration-test').click();await expect.poll(()=>page.evaluate(()=>(window as any).vibrations.length)).toBe(1);await page.locator('#settings-close').click();
  await page.evaluate(()=>{(window as any).vibrations=[];(window as any).fixture.kill();});expect(await page.evaluate(()=>(window as any).vibrations)).toEqual([[35,20,55]]);
  await page.evaluate(()=>{const f=(window as any).fixture;f.show();f.show(true);f.wall();f.show();});expect(await page.evaluate(()=>(window as any).vibrations)).toEqual([[35,20,55],[90,40,120]]);
  await page.evaluate(()=>(window as any).fixture.show(true));expect(await page.evaluate(()=>(window as any).vibrations)).toEqual([[35,20,55],[90,40,120]]);
  await page.reload();await page.waitForFunction(()=>!!(window as any).fixture?.scene.combatState());await page.evaluate(()=>(window as any).fixture.mutual());expect(await page.evaluate(()=>(window as any).vibrations)).toEqual([[90,40,120]]);
  await page.reload();await page.waitForFunction(()=>!!(window as any).fixture?.scene.combatState());await page.locator('#settings').click();await page.locator('#kill-vibration').uncheck();await page.locator('#settings-close').click();await page.evaluate(()=>{(window as any).fixture.kill();(window as any).fixture.wall();});expect(await page.evaluate(()=>(window as any).vibrations)).toEqual([]);
  await page.reload();await page.waitForFunction(()=>!!(window as any).fixture?.scene.combatState());await page.evaluate(()=>Object.defineProperty(navigator,'vibrate',{value:undefined,configurable:true}));await page.locator('#settings').click();await expect(page.locator('#vibration-test')).toBeDisabled();await expect(page.locator('#vibration-support')).toContainText('지원하지');await page.locator('#settings-close').click();await page.evaluate(()=>(window as any).fixture.kill());
 }finally{await context.close();}
});

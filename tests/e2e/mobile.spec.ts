import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
test('T31 real emulated touch controls both practice and online, retains direction and fits rotation',async({browser})=>{
 test.setTimeout(90000);const server=createGameServer({config:{countdownSeconds:0.03},seed:()=>4});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
 await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');await page.getByTestId('practice').click();await expect(page.locator('#joystick')).toBeVisible();
  const cdp=await context.newCDPSession(page);
  const send=(type: 'touchStart'|'touchMove'|'touchEnd'|'touchCancel',points:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const box=(await page.locator('#joystick').boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
  const before=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection());
  await send('touchStart',[{x,y,id:1}]);await send('touchEnd',[]);expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection())).toEqual(before);
  await send('touchStart',[{x,y,id:1}]);await send('touchMove',[{x:x+45,y,id:1}]);await page.waitForTimeout(100);
  expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection())).toEqual({x:1,y:0});await send('touchEnd',[]);
  await page.waitForTimeout(150);expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection())).toEqual({x:1,y:0});
  await send('touchStart',[{x,y,id:1}]);await send('touchStart',[{x,y,id:1},{x:x-45,y:y-45,id:2}]);
  await send('touchMove',[{x:x+box.width*2,y,id:1},{x:x-45,y:y-45,id:2}]);
  expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection())).toEqual({x:1,y:0});
  await send('touchEnd',[{x:x-45,y:y-45,id:2}]);await send('touchMove',[{x:x-45,y:y+45,id:2}]);await send('touchEnd',[]);
  expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection())).toEqual({x:1,y:0});
  await send('touchStart',[{x,y,id:1}]);await send('touchMove',[{x,y:y-45,id:1}]);await send('touchCancel',[]);
  expect((await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection())).y).toBe(-1);
  for(const viewport of [{width:844,height:390},{width:390,height:844},{width:844,height:360},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   await expect.poll(async()=>{const canvas=(await page.locator('#field canvas').boundingBox())!;return {x:Math.round(canvas.x),y:Math.round(canvas.y),width:Math.round(canvas.width),height:Math.round(canvas.height)};}).toEqual({x:0,y:0,...viewport});
  }
  for(const id of ['#hud','#joystick']){const b=(await page.locator(id).boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(844);expect(b.y+b.height).toBeLessThanOrEqual(390);}
  expect(await page.locator('#field canvas').evaluate((c:any)=>c.width/c.clientWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({path:'evidence/T31-mobile-landscape.png'});
  await page.getByTestId('leave').click();await page.setViewportSize({width:390,height:844});await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();await expect(page.locator('#hud')).toBeVisible();
  const onlineBox=(await page.locator('#joystick').boundingBox())!,ox=onlineBox.x+onlineBox.width/2,oy=onlineBox.y+onlineBox.height/2;
  const startPosition=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().participants.find((p:any)=>p.kind==='HUMAN').position);
  const inward=Math.abs(startPosition.x)>Math.abs(startPosition.y)?{x:startPosition.x>0?-1:1,y:0}:{x:0,y:startPosition.y>0?-1:1};
  await send('touchStart',[{x:ox,y:oy,id:1}]);await send('touchMove',[{x:ox+45*inward.x,y:oy+45*inward.y,id:1}]);await send('touchEnd',[]);
  await expect.poll(()=>{const room=server.rooms.rooms.values().next().value!;return room.match?.participants.find(p=>p.kind==='HUMAN')?.direction;}).toEqual(inward);
  // Constant movement must not reset camera scroll whenever a 10Hz snapshot arrives.
  await page.waitForTimeout(500);
  const cameraSamples=await page.evaluate(()=>new Promise<{at:number;camera:{x:number;y:number};tick:number;lifeId:number|null;lifeState:string|null}[]>(resolve=>{
   const samples:any[]=[];let start=0;const frame=(at:number)=>{if(!start)start=at;const state=(window as any).__HEXHOLD_TEST__.getRenderState();samples.push({...state,at:state.renderedAt});if(at-start>=1200)resolve(samples);else requestAnimationFrame(frame);};requestAnimationFrame(frame);
  }));
  expect(new Set(cameraSamples.map(s=>s.tick)).size).toBeGreaterThanOrEqual(8);
  const jumps=cameraSamples.slice(1).flatMap((s,i)=>s.lifeId===cameraSamples[i].lifeId&&s.lifeState==='ALIVE'&&cameraSamples[i].lifeState==='ALIVE'?[{distance:Math.hypot(s.camera.x-cameraSamples[i].camera.x,s.camera.y-cameraSamples[i].camera.y),allowed:Math.sqrt(3)*32*6*(s.at-cameraSamples[i].at)/1000+8}]:[]);
  expect(jumps.length).toBeGreaterThan(10);
  expect(Math.max(...jumps.map(s=>s.distance-s.allowed))).toBeLessThanOrEqual(0);
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){
   await page.setViewportSize(viewport);
   await expect.poll(async()=>{const canvas=(await page.locator('#field canvas').boundingBox())!;return {x:Math.round(canvas.x),y:Math.round(canvas.y),width:Math.round(canvas.width),height:Math.round(canvas.height)};}).toEqual({x:0,y:0,...viewport});
  }
  await page.screenshot({path:'evidence/T31-mobile-online.png'});
 }finally{await context.close();await server.close();}
});



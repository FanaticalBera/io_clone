import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {leaveParticipant} from '../../src/shared/life.js';

for(const mode of ['drag','trackpad','joystick'] as const)test(`${mode}: a held real touch survives a normal wall death and three-second respawn`,async({browser})=>{
 process.env.NODE_ENV='test';let now=0;
 const server=createGameServer({autoStart:false,now:()=>now,seed:()=>115,initializeMatch:m=>{for(const p of m.participants)if(p.kind==='BOT')leaveParticipant(m,p);}});
 await new Promise<void>(resolve=>server.http.listen(3002,'127.0.0.1',resolve));
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.addInitScript(mode=>{try{localStorage.setItem('hexhold.tutorialSeen','1');localStorage.setItem('hexhold.settings',JSON.stringify({mobileControls:mode,killVibration:true}));}catch{}Object.assign(window,{vibrations:[]});Object.defineProperty(navigator,'vibrate',{configurable:true,writable:true,value:(pattern:number|number[])=>{(window as any).vibrations.push(pattern);return true;}});},mode);
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');await page.getByTestId('nickname').fill('HOLD');await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();now=3000;server.loop.pump();await expect(page.locator('#hud')).toBeVisible();
  const room=[...server.rooms.rooms.values()][0],match=room.match!,self=match.participants.find(p=>p.kind==='HUMAN')!;
  const cdp=await context.newCDPSession(page),touch=(type:'touchStart'|'touchMove'|'touchEnd',x=0,y=0)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
  const vector=()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection());
  let x=400,y=260;
  if(mode==='joystick'){const box=(await page.locator('#joystick').boundingBox())!;x=box.x+box.width/2;y=box.y+box.height/2;await touch('touchStart',x+40,y);}
  else{await touch('touchStart',x,y);await touch('touchMove',x+100,y);x+=100;}
  await expect.poll(async()=>(await vector()).x).toBeGreaterThan(.99);
  await expect.poll(()=>room.inputs.get(self.participantId)?.dx??0).toBeGreaterThan(.99);
  // The server's ordinary movement reaches the boundary; no markDead or
  // position/ownership/trail edits prepare the death or the new life.
  let guard=0;while(self.lifeState==='ALIVE'&&guard++<600){now+=1000/30;server.loop.pump();}
  expect(self.lifeState).toBe('DEAD_WAIT');expect(self.deathReason).toBe('WALL_HIT');server.loop.publishSnapshot(room,false,true);
  await expect(page.locator('#death')).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.enabled())).toBe(false);
  await expect.poll(()=>page.evaluate(()=>(window as any).vibrations)).toEqual([[90,40,120]]);
  const held=await vector(),position={...self.position};
  await touch('touchMove',x,y-40);await page.waitForTimeout(80);expect(await vector()).toEqual(held);expect(self.position).toEqual(position);
  if(mode==='joystick')await expect(page.locator('#joystick')).toBeVisible();
  guard=0;while(self.lifeState!=='ALIVE'&&guard++<100){now+=1000/30;server.loop.pump();}
  expect(self.lifeId).toBe(2);server.loop.publishSnapshot(room,false,true);await expect(page.locator('#death')).toBeHidden();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.enabled())).toBe(true);
  if(mode==='joystick')await expect.poll(vector).toEqual({x:0,y:-1});
  else{await touch('touchMove',x,y-200);await expect.poll(async()=>(await vector()).y).toBeLessThan(-.8);}
  // The initial spawn heading can arrive before the held-touch packet. Wait
  // for the intended new-life direction, not merely any lifeId 2 packet.
  await expect.poll(()=>({lifeId:room.inputs.get(self.participantId)?.lifeId,up:(room.inputs.get(self.participantId)?.dy??0)<-.8})).toEqual({lifeId:2,up:true});
  const before={...self.position};now+=1000/30;server.loop.pump();expect(self.position).not.toEqual(before);
  expect(await page.evaluate(()=>(window as any).vibrations)).toEqual([[90,40,120]]);
  await touch('touchEnd');await page.screenshot({path:`evidence/respawn-held-${mode}.png`});
 }finally{await context.close();await server.close();}
});

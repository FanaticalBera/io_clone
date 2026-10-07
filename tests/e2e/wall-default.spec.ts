import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {wallFixture} from '../../docs/wall-experiment/fixture.js';
import {stepMatch} from '../../src/shared/game.js';
const sizes=[{width:844,height:390},{width:640,height:320},{width:568,height:320}];

test('normal practice uses adopted wall visuals and full-speed margin on mobile without opt-in',async({browser})=>{
 for(const viewport of sizes){
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
   await page.goto('http://127.0.0.1:5174/?experimentSeed=4');await page.getByTestId('practice').click();
   await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__?.getScene().wallVisualState().enabled)).toBe(true);
   await page.evaluate(async()=>{
    const t=(window as any).__HEXHOLD_TEST__,p=t.getPractice();p.setPaused(true);
    const {wallFixture}=await import(/* @vite-ignore */ '/docs/wall-experiment/fixture.ts' as string);wallFixture(true,'push',p.match);t.showPracticeView();
   });
   await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().wallVisualState().edges)).toBeGreaterThan(0);
   await page.evaluate(async()=>{const t=(window as any).__HEXHOLD_TEST__,{stepMatch}=await import(/* @vite-ignore */ '/src/shared/game.ts' as string);stepMatch(t.getPractice().match);t.showPracticeView();});
   expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().participants[0].lifeState)).toBe('ALIVE');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
   await page.screenshot({path:'.local/adopted-wall-'+viewport.width+'.png'});
   await page.evaluate(async()=>{const t=(window as any).__HEXHOLD_TEST__,{stepMatch}=await import(/* @vite-ignore */ '/src/shared/game.ts' as string);stepMatch(t.getPractice().match);t.showPracticeView();});
   await expect(page.locator('#run-results')).toBeVisible();expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().participants[0].deathReason)).toBe('WALL_HIT');
   expect(errors).toEqual([]);
  }finally{await context.close();}
 }
});

test('online ignores development strict override and restores a live margin snapshot',async({page})=>{
 process.env.NODE_ENV='test';let now=0;
 const server=createGameServer({autoStart:false,now:()=>now,config:{mapRadius:5,maxSlots:2,spawnRadius:1},initializeMatch:m=>{wallFixture(true,'push',m);}});
 await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));await page.goto('http://127.0.0.1:5174/?experimentWall=strict');await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();now=3000;server.loop.pump();await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().wallVisualState())).toMatchObject({enabled:true,highlight:true});
  const room=server.rooms.rooms.values().next().value!,m=room.match!,p=m.participants[0];stepMatch(m);server.loop.publishSnapshot(room,false,true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView()?.tick)).toBe(m.tick);expect(p.lifeState).toBe('ALIVE');
  await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.transportClose(false));await expect.poll(()=>room.members.get(p.participantId)!.graceUntil).not.toBeNull();
  await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.reconnect());await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.enabled())).toBe(true);
  expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().participants[0].position)).toEqual(p.position);
  stepMatch(m);server.loop.publishSnapshot(room,false,true);await expect(page.locator('#run-results')).toBeVisible();expect(p.deathReason).toBe('WALL_HIT');expect(errors).toEqual([]);
 }finally{await page.goto('about:blank');await server.close();}
});

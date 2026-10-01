import {test,expect,type Page} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {initializeVerticalMatch} from './server.js';
import {markDead} from '../../src/shared/life.js';
import {until} from '../server/helpers.js';
async function latest(page:Page):Promise<any>{return page.evaluate(()=>((window as any).__HEXHOLD_TEST__.history as any[]).at(-1));}
test('T29/T30 two browsers preserve current dead/life state on transport recovery and reject an expired slot',async({browser})=>{
 test.setTimeout(120000);process.env.NODE_ENV='test';let now=0;
 const server=createGameServer({autoStart:false,now:()=>now,seed:()=>13,config:{roundSeconds:30},initializeMatch:initializeVerticalMatch});
 await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const ca=await browser.newContext(),cb=await browser.newContext();for(const c of [ca,cb])await c.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const a=await ca.newPage(),b=await cb.newPage();await a.goto('http://127.0.0.1:5174');await a.getByTestId('nickname').fill('A');await a.getByTestId('create').click();
  await expect(a.locator('#room-panel')).toBeVisible();const code=await a.locator('#friend-code').textContent();
  await b.goto('http://127.0.0.1:5174/?room='+code);await b.getByTestId('nickname').fill('B');await b.getByTestId('join').click();await expect(a.locator('#members')).toContainText('B');await a.getByTestId('start').click();
  now=3000;server.loop.pump();await expect(a.locator('#hud')).toBeVisible();await expect(b.locator('#hud')).toBeVisible();
  const room=server.rooms.rooms.values().next().value!,m=room.match!,pa=m.participants.find(p=>p.nickname==='A')!,id=pa.participantId;
  const originalToken=await a.evaluate(()=>sessionStorage.getItem('hexhold.session'));
  pa.controlScore=7;
  await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.transportClose(false));
  await until(()=>room.members.get(id)!.graceUntil!==null);const detectedAt=now;
  expect(room.members.get(id)!.graceUntil).toBe(detectedAt+10000);
  for(let i=0;i<10;i++){now+=1000/30;server.loop.pump();}
  markDead(m,pa,'TRAIL_CUT');server.loop.publishSnapshot(room,false,true);
  await expect.poll(async()=>{const s=await latest(b);return s.tick;}).toBeGreaterThan(0);
  await expect.poll(async()=>a.evaluate(()=>(window as any).__HEXHOLD_TEST__.enabled())).toBe(false);
  await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.reconnect());
  await expect.poll(async()=>{const s=await latest(a);return s.participants.find((p:any)=>p.participantId===id)?.deaths;}).toBe(1);
  const restored=await latest(a),self=restored.participants.find((p:any)=>p.participantId===id);
  expect(restored.selfParticipantId).toBe(id);expect(self).toMatchObject({lifeId:1,lifeState:'DEAD_WAIT',controlScore:7,territoryCount:0,deaths:1});
  expect(await a.evaluate(()=>sessionStorage.getItem('hexhold.session'))).toBe(originalToken);
  const deadline=pa.respawnAtTick;
  while(m.tick<=deadline){now+=1000/30;server.loop.pump();}
  server.loop.publishSnapshot(room,false,true);
  await expect.poll(async()=>{const s=await latest(a);return s.participants.find((p:any)=>p.participantId===id).lifeId;}).toBe(2);
  expect(pa.territoryCount).toBe(19);expect(pa.controlScore).toBe(7);
  await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.transportClose(false));
  await until(()=>room.members.get(id)!.graceUntil!==null);
  const expires=room.members.get(id)!.graceUntil!;
  while(now<expires){now=Math.min(expires,now+100);server.loop.pump();}
  const replacement=m.participants.find(p=>p.slot===pa.slot)!;expect(replacement.participantId).not.toBe(id);expect(replacement.kind).toBe('BOT');expect(replacement.controlScore).toBe(0);
  server.loop.publishSnapshot(room,false,true);await expect.poll(async()=>{const s=await latest(b);return s.participants.some((p:any)=>p.participantId===id);}).toBe(false);
  await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.reconnect());await expect(a.locator('#notice')).toContainText('복구 시간이 지났');
  await a.locator('#retry').click();await expect(a.locator('#room-panel')).toBeVisible();
  expect(await a.evaluate(()=>sessionStorage.getItem('hexhold.session'))).not.toBe(originalToken);
  const serialized=JSON.stringify(await b.evaluate(()=>(window as any).__HEXHOLD_TEST__.history));expect(serialized).not.toContain(originalToken!);
  await b.screenshot({path:'evidence/T30-reconnect.png'});
 }finally{await ca.close();await cb.close();await server.close();}
});

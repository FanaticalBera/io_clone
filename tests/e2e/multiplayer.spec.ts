import {completeClassic} from '../mode-fixture.js';
import {test,expect,type Page} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {initializeVerticalMatch} from './server.js';
import {axialToWorld} from '../../src/shared/hex.js';
import {until} from '../server/helpers.js';
const base='http://127.0.0.1:5174';
async function direction(page:Page,x:number,y:number):Promise<void>{await page.evaluate(({x,y})=>(window as any).__HEXHOLD_TEST__.direction(x,y),{x,y});}
async function latest(page:Page):Promise<any>{return page.evaluate(()=>((window as any).__HEXHOLD_TEST__.history as any[]).at(-1));}
test('T27 same authoritative capture, old-trail cut, respawn and result in two browsers',async({browser})=>{
 test.setTimeout(180000);process.env.NODE_ENV='test';let now=0;
 const server=createGameServer({autoStart:false,now:()=>now,config:{roundSeconds:30},seed:()=>13,initializeMatch:initializeVerticalMatch});
 await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const ca=await browser.newContext(),cb=await browser.newContext();
 for(const c of [ca,cb])await c.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const a=await ca.newPage(),b=await cb.newPage();await a.goto(base);await a.getByTestId('nickname').fill('A');await a.getByTestId('create').click();
  await expect(a.locator('#room-panel')).toBeVisible();const code=await a.locator('#friend-code').textContent();
  await b.goto(base+'/?room='+code);await b.getByTestId('nickname').fill('B');await b.getByTestId('join').click();await expect(a.locator('#members')).toContainText('B');await a.getByTestId('start').click();
  now=3000;server.loop.pump();await expect(a.locator('#hud')).toBeVisible();await expect(b.locator('#hud')).toBeVisible();
  const room=server.rooms.rooms.values().next().value!,m=room.match!,pa=m.participants.find(p=>p.nickname==='A')!,pb=m.participants.find(p=>p.nickname==='B')!;
  expect(await a.evaluate(()=>sessionStorage.getItem('hexhold.session'))).not.toBe(await b.evaluate(()=>sessionStorage.getItem('hexhold.session')));
  const home=axialToWorld(7,2);
  async function tick(count=1):Promise<void>{
   for(let i=0;i<count;i++){
    const dx=home.x-pb.position.x,dy=home.y-pb.position.y;
    if(pb.lifeState==='ALIVE')await direction(b,Math.hypot(dx,dy)>2?dx:1,Math.hypot(dx,dy)>2?dy:0);
    await b.waitForTimeout(40);now+=1000/30;server.loop.pump();
   }
  }
  async function draw(q:number,r:number):Promise<void>{
   const target=axialToWorld(q,r),start=m.tick;
   await direction(a,target.x-pa.position.x,target.y-pa.position.y);
   await until(()=>room.inputs.has(pa.participantId));
   while(Math.hypot(target.x-pa.position.x,target.y-pa.position.y)>Math.sqrt(3)*32*0.35){
    if(m.tick-start>150)throw new Error('Waypoint did not complete');
    await direction(a,target.x-pa.position.x,target.y-pa.position.y);await tick();
   }
  }
  for(const [q,r]of [[3,0],[3,-3],[0,-3],[0,0]])await draw(q,r);
  expect(pa.territoryCount).toBeGreaterThan(20);expect(m.owners[m.map.byKey.get('1,-1')!]).toBe(pa.slot+1);
  await direction(a,-1,0);await until(()=>room.inputs.has(pa.participantId));await tick(35);
  const oldCell=m.map.byKey.get('-1,0')!;expect(m.trailMasks[oldCell]&(1<<pa.slot)).toBe(1);
  await direction(a,0,-1);await until(()=>room.inputs.has(pa.participantId));
  const target=axialToWorld(-1,0);await direction(b,target.x-pb.position.x,target.y-pb.position.y);await until(()=>room.inputs.has(pb.participantId));
  let limit=0;
  while(pa.deaths===0&&limit++<100){await b.waitForTimeout(40);now+=1000/30;server.loop.pump();}
  expect(pa.deaths).toBe(1);expect(pa.lifeState).toBe('DEAD_WAIT');expect(pb.kills).toBe(1);
  server.loop.publishSnapshot(room,false,true);await expect.poll(async()=>{const s=await latest(a);return s.participants.find((p:any)=>p.participantId===pa.participantId).deaths;}).toBe(1);
  await expect.poll(()=>a.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().deaths)).toBe(1);
  await expect.poll(()=>b.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().kills)).toBe(1);
  const deathEvent=(await latest(a)).events.find((e:any)=>e.type==='DEATH'&&e.participantId===pa.participantId);
  expect(deathEvent).toMatchObject({killerId:pb.participantId,lifeId:1});expect(deathEvent.position).toEqual(pa.position);
  const untilSpawn=m.tick+100;while(pa.lifeId===1&&m.tick<untilSpawn)await tick();
  expect(pa.lifeId).toBe(2);expect(pa.territoryCount).toBe(19);server.loop.publishSnapshot(room,false,true);
  await expect.poll(async()=>{const s=await latest(b);return s.participants.find((p:any)=>p.participantId===pa.participantId).lifeId;}).toBe(2);
  const ha=await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.history),hb=await b.evaluate(()=>(window as any).__HEXHOLD_TEST__.history);
  const bySeq=new Map<number,any>(hb.map((s:any)=>[s.snapshotSeq,s])),common=ha.filter((s:any)=>bySeq.has(s.snapshotSeq));
  expect(common.length).toBeGreaterThan(5);
  for(const s of common){const peer=bySeq.get(s.snapshotSeq);expect(s.tick).toBe(peer.tick);expect(s.matchId).toBe(peer.matchId);expect(s.owners).toBe(peer.owners);expect(s.trailMasks).toBe(peer.trailMasks);expect(s.participants).toEqual(peer.participants);}
  await a.screenshot({path:'evidence/T27-two-browser.png'});
  completeClassic(m);while(m.phase==='RUNNING'){now+=1000/30;server.loop.pump();}
  server.loop.publishSnapshot(room,false,true);await expect(a.locator('#results')).toBeVisible();await expect(b.locator('#results')).toBeVisible();
  expect(await a.locator('#result-rows').textContent()).toBe(await b.locator('#result-rows').textContent());
  await test.info().attach('same-authoritative-snapshots',{body:JSON.stringify({commonSnapshots:common.length,matchId:m.matchId,results:m.results}),contentType:'application/json'});
 }finally{await ca.close();await cb.close();await server.close();}
});

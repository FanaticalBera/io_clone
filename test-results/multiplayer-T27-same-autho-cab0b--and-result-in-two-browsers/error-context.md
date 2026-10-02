# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer.spec.ts >> T27 same authoritative capture, old-trail cut, respawn and result in two browsers
- Location: tests\e2e\multiplayer.spec.ts:10:1

# Error details

```
Error: Waypoint did not complete
```

# Test source

```ts
  1  | import {completeClassic} from '../mode-fixture.js';
  2  | import {test,expect,type Page} from '@playwright/test';
  3  | import {createGameServer} from '../../src/server/app.js';
  4  | import {initializeVerticalMatch} from './server.js';
  5  | import {axialToWorld} from '../../src/shared/hex.js';
  6  | import {until} from '../server/helpers.js';
  7  | const base='http://127.0.0.1:5174';
  8  | async function direction(page:Page,x:number,y:number):Promise<void>{await page.evaluate(({x,y})=>(window as any).__HEXHOLD_TEST__.direction(x,y),{x,y});}
  9  | async function latest(page:Page):Promise<any>{return page.evaluate(()=>((window as any).__HEXHOLD_TEST__.history as any[]).at(-1));}
  10 | test('T27 same authoritative capture, old-trail cut, respawn and result in two browsers',async({browser})=>{
  11 |  test.setTimeout(180000);process.env.NODE_ENV='test';let now=0;
  12 |  const server=createGameServer({autoStart:false,now:()=>now,config:{roundSeconds:30},seed:()=>13,initializeMatch:initializeVerticalMatch});
  13 |  await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
  14 |  const ca=await browser.newContext(),cb=await browser.newContext();
  15 |  for(const c of [ca,cb])await c.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
  16 |  try{
  17 |   const a=await ca.newPage(),b=await cb.newPage();await a.goto(base);await a.getByTestId('nickname').fill('A');await a.getByTestId('create').click();
  18 |   await expect(a.locator('#room-panel')).toBeVisible();const code=await a.locator('#friend-code').textContent();
  19 |   await b.goto(base+'/?room='+code);await b.getByTestId('nickname').fill('B');await b.getByTestId('join').click();await expect(a.locator('#members')).toContainText('B');await a.getByTestId('start').click();
  20 |   now=3000;server.loop.pump();await expect(a.locator('#hud')).toBeVisible();await expect(b.locator('#hud')).toBeVisible();
  21 |   const room=server.rooms.rooms.values().next().value!,m=room.match!,pa=m.participants.find(p=>p.nickname==='A')!,pb=m.participants.find(p=>p.nickname==='B')!;
  22 |   expect(await a.evaluate(()=>sessionStorage.getItem('hexhold.session'))).not.toBe(await b.evaluate(()=>sessionStorage.getItem('hexhold.session')));
  23 |   const home=axialToWorld(7,2);
  24 |   async function tick(count=1):Promise<void>{
  25 |    for(let i=0;i<count;i++){
  26 |     const dx=home.x-pb.position.x,dy=home.y-pb.position.y;
  27 |     if(pb.lifeState==='ALIVE')await direction(b,Math.hypot(dx,dy)>2?dx:1,Math.hypot(dx,dy)>2?dy:0);
  28 |     await b.waitForTimeout(40);now+=1000/30;server.loop.pump();
  29 |    }
  30 |   }
  31 |   async function draw(q:number,r:number):Promise<void>{
  32 |    const target=axialToWorld(q,r),start=m.tick;
  33 |    await direction(a,target.x-pa.position.x,target.y-pa.position.y);
  34 |    await until(()=>room.inputs.has(pa.participantId));
  35 |    while(Math.hypot(target.x-pa.position.x,target.y-pa.position.y)>Math.sqrt(3)*32*0.35){
> 36 |     if(m.tick-start>150)throw new Error('Waypoint did not complete');await tick();
     |                               ^ Error: Waypoint did not complete
  37 |    }
  38 |   }
  39 |   for(const [q,r]of [[3,0],[3,-3],[0,-3],[0,0]])await draw(q,r);
  40 |   expect(pa.territoryCount).toBeGreaterThan(20);expect(m.owners[m.map.byKey.get('1,-1')!]).toBe(pa.slot+1);
  41 |   await direction(a,-1,0);await until(()=>room.inputs.has(pa.participantId));await tick(35);
  42 |   const oldCell=m.map.byKey.get('-1,0')!;expect(m.trailMasks[oldCell]&(1<<pa.slot)).toBe(1);
  43 |   await direction(a,0,-1);await until(()=>room.inputs.has(pa.participantId));
  44 |   const target=axialToWorld(-1,0);await direction(b,target.x-pb.position.x,target.y-pb.position.y);await until(()=>room.inputs.has(pb.participantId));
  45 |   let limit=0;
  46 |   while(pa.deaths===0&&limit++<100){await b.waitForTimeout(40);now+=1000/30;server.loop.pump();}
  47 |   expect(pa.deaths).toBe(1);expect(pa.lifeState).toBe('DEAD_WAIT');expect(pb.kills).toBe(1);
  48 |   server.loop.publishSnapshot(room,false,true);await expect.poll(async()=>{const s=await latest(a);return s.participants.find((p:any)=>p.participantId===pa.participantId).deaths;}).toBe(1);
  49 |   await expect.poll(()=>a.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().deaths)).toBe(1);
  50 |   await expect.poll(()=>b.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().kills)).toBe(1);
  51 |   const deathEvent=(await latest(a)).events.find((e:any)=>e.type==='DEATH'&&e.participantId===pa.participantId);
  52 |   expect(deathEvent).toMatchObject({killerId:pb.participantId,lifeId:1});expect(deathEvent.position).toEqual(pa.position);
  53 |   const untilSpawn=m.tick+100;while(pa.lifeId===1&&m.tick<untilSpawn)await tick();
  54 |   expect(pa.lifeId).toBe(2);expect(pa.territoryCount).toBe(19);server.loop.publishSnapshot(room,false,true);
  55 |   await expect.poll(async()=>{const s=await latest(b);return s.participants.find((p:any)=>p.participantId===pa.participantId).lifeId;}).toBe(2);
  56 |   const ha=await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.history),hb=await b.evaluate(()=>(window as any).__HEXHOLD_TEST__.history);
  57 |   const bySeq=new Map<number,any>(hb.map((s:any)=>[s.snapshotSeq,s])),common=ha.filter((s:any)=>bySeq.has(s.snapshotSeq));
  58 |   expect(common.length).toBeGreaterThan(5);
  59 |   for(const s of common){const peer=bySeq.get(s.snapshotSeq);expect(s.tick).toBe(peer.tick);expect(s.matchId).toBe(peer.matchId);expect(s.owners).toBe(peer.owners);expect(s.trailMasks).toBe(peer.trailMasks);expect(s.participants).toEqual(peer.participants);}
  60 |   await a.screenshot({path:'evidence/T27-two-browser.png'});
  61 |   completeClassic(m);while(m.phase==='RUNNING'){now+=1000/30;server.loop.pump();}
  62 |   server.loop.publishSnapshot(room,false,true);await expect(a.locator('#results')).toBeVisible();await expect(b.locator('#results')).toBeVisible();
  63 |   expect(await a.locator('#result-rows').textContent()).toBe(await b.locator('#result-rows').textContent());
  64 |   await test.info().attach('same-authoritative-snapshots',{body:JSON.stringify({commonSnapshots:common.length,matchId:m.matchId,results:m.results}),contentType:'application/json'});
  65 |  }finally{await ca.close();await cb.close();await server.close();}
  66 | });
  67 | 
```
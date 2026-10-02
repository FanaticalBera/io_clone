import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {addTrail,setOwner,neutralizeTerritory} from '../../src/shared/territory.js';
import {markDead} from '../../src/shared/life.js';
for(const scenario of ['enclosed','home','pruned'] as const)test(`${scenario}: captured trail or lost home connection kills remotely with one confirmed impact on both clients`,async({browser})=>{
 process.env.NODE_ENV='test';let now=0;const server=createGameServer({autoStart:false,now:()=>now,seed:()=>4,initializeMatch:m=>{
  for(const p of m.participants){neutralizeTerritory(m,p);p.protectedUntilTick=0;p.spawnCells.clear();if(p.kind==='BOT')markDead(m,p,'TERRITORY_LOST');}
  const [a,b]=m.participants.filter(p=>p.kind==='HUMAN'),id=(q:number,r:number)=>m.map.byKey.get(q+','+r)!;
  setOwner(m,id(0,-1),a.slot+1);a.cellId=id(0,-1);
  if(scenario==='enclosed'){setOwner(m,id(3,0),b.slot+1);b.cellId=id(2,0);for(const [q,r]of [[1,0],[1,-1],[-1,0],[-1,1],[0,1]])addTrail(m,a,id(q,r));addTrail(m,b,id(0,0));addTrail(m,b,id(2,0));}
  else if(scenario==='home'){setOwner(m,id(0,0),b.slot+1);b.cellId=id(2,0);addTrail(m,a,id(0,0));addTrail(m,b,id(1,0));addTrail(m,b,id(2,0));}
  else{for(const q of [-3,-2,-1,0,1])setOwner(m,id(q,0),b.slot+1);setOwner(m,id(3,0),a.slot+1);b.cellId=id(3,0);addTrail(m,a,id(0,0));addTrail(m,b,id(2,0));addTrail(m,b,id(3,0));}
  for(const p of [a,b]){p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};}
 }});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));const first=await browser.newContext(),second=await browser.newContext();for(const context of [first,second])await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const a=await first.newPage(),b=await second.newPage();await a.goto('http://127.0.0.1:5174');await b.goto('http://127.0.0.1:5174');await a.getByTestId('nickname').fill('점령자');await b.getByTestId('nickname').fill('침입자');await a.getByTestId('create').click();await expect(a.locator('#room-panel')).toBeVisible();const code=(await a.locator('#friend-code').textContent())!;await b.getByTestId('room-code').fill(code);await b.getByTestId('join').click();await expect(b.locator('#room-panel')).toBeVisible();await a.getByTestId('start').click();now=3000;server.loop.pump();await expect(a.locator('#hud')).toBeVisible();await expect(b.locator('#hud')).toBeVisible();
  const room=[...server.rooms.rooms.values()][0];if(scenario!=='enclosed')expect(room.match!.trailMasks[room.match!.map.byKey.get('0,0')!]&2).toBe(0);
  now+=34;server.loop.pump();server.loop.publishSnapshot(room,false,true);await expect(a.locator('#kill-count')).toHaveText('1');await expect(b.getByTestId('death')).toContainText(scenario==='enclosed'?'점령으로 선이 끊겼어요':'선의 출발 영토를 잃었어요');
  await expect.poll(()=>a.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState()?.kills)).toBe(1);await expect.poll(()=>b.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState()?.deaths)).toBe(1);const death=room.match!.events.find(e=>e.type==='DEATH'&&e.participantId===room.match!.participants.find(p=>p.nickname==='침입자')!.participantId)!;expect(death.reason).toBe('TRAIL_CUT');
  for(let i=0;i<3;i++)server.loop.publishSnapshot(room,false,true);await a.waitForTimeout(100);expect(await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().kills)).toBe(1);expect(await b.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().deaths)).toBe(1);
  const firstView=await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView()),secondView=await b.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView());expect(firstView.owners).toEqual(secondView.owners);expect(firstView.participants).toEqual(secondView.participants);
  // SnapshotGate removes already delivered events from subsequent presentation views.
  expect(firstView.events.filter((e:any)=>e.eventId===death.eventId)).toHaveLength(0);expect(await a.evaluate(eventId=>(window as any).__HEXHOLD_TEST__.history.some((raw:any)=>raw.events.some((e:any)=>e.eventId===eventId)),death.eventId)).toBe(true);expect(await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().lastEventId)).toBe(death.eventId);await b.screenshot({path:`evidence/death-cause-${scenario}.png`});
 }finally{await first.close();await second.close();await server.close();}
});
test('smaller world scale survives resize and mouse motion near the marker retains its direction',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}});try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/tests/fixtures/combat.html');await page.waitForFunction(()=>!!(window as any).fixture?.scene.combatState());await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.renderState().zoom)).toBe(.38);
  expect(await page.evaluate(()=>(window as any).fixture.scene.pointerDirection(innerWidth/2+10,innerHeight/2))).toBeNull();expect(await page.evaluate(()=>(window as any).fixture.scene.pointerDirection(innerWidth/2+25,innerHeight/2))).not.toBeNull();await page.screenshot({path:'evidence/field-scale-desktop.png'});
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.renderState().zoom)).toBe(.35);expect(await page.evaluate(()=>(window as any).fixture.scene.pointerDirection(innerWidth/2+10,innerHeight/2))).toBeNull();await page.screenshot({path:'evidence/field-scale-mobile.png'});
  await page.setViewportSize({width:844,height:390});await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.renderState().zoom)).toBe(.38);
 }finally{await context.close();}
});

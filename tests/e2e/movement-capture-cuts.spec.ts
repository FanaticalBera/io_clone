import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {leaveParticipant} from '../../src/shared/life.js';

for(const reverse of [false,true])test(`real room movement: ${reverse?'B':'A'} loses the departure connection without direct trail contact`,async({browser})=>{
 process.env.NODE_ENV='test';let now=0;
 const server=createGameServer({autoStart:false,now:()=>now,seed:()=>reverse?17:115,initializeMatch:match=>{
  // The ordinary room spawns its full roster. Unrelated bots then leave using
  // the normal lifecycle so they cannot interfere with the two-human route.
  for(const p of match.participants)if(p.kind==='BOT')leaveParticipant(match,p);
 }});
 await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);for(const context of contexts)await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const a=await contexts[0].newPage(),b=await contexts[1].newPage();await a.goto('http://127.0.0.1:5174');await b.goto('http://127.0.0.1:5174');
  await a.getByTestId('nickname').fill('A');await b.getByTestId('nickname').fill('B');await a.getByTestId('create').click();await expect(a.locator('#room-panel')).toBeVisible();
  await b.getByTestId('room-code').fill((await a.locator('#friend-code').textContent())!);await b.getByTestId('join').click();await expect(a.locator('#members')).toContainText('B');await a.getByTestId('start').click();
  now=3000;server.loop.pump();await expect(a.locator('#hud')).toBeVisible();await expect(b.locator('#hud')).toBeVisible();
  const room=[...server.rooms.rooms.values()][0],m=room.match!;
  const humans=m.participants.filter(p=>p.kind==='HUMAN');expect(humans).toHaveLength(2);expect(humans.every(p=>p.territoryCount===19&&p.trailCells.size===0&&p.lifeId===1)).toBe(true);
  const f=new MovementCaptureFixture(reverse,'classic',m,inputs=>{
   // Direction intents enter the actual room loop; the server alone advances
   // positions, creates trails, computes capture and emits death/snapshots.
   for(const [id,input]of inputs)room.inputs.set(id,input);now+=1000/30;server.loop.pump();
  });
  f.run();expect(server.loop.metrics.steps).toBe(m.tick);expect(f.directContacts).toBe(0);
  const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===f.victim.participantId&&p.lostTerritory)!;
  expect(record).toMatchObject({candidate:false,connectedBefore:true,touchesHomeAfter:false,anyTrailTouchesHomeAfter:true,claimedTrailCells:[],cut:true,markDeadCalled:true,markedDead:true,lifeStateAfter:'DEAD_WAIT',trailMaskCellsAfter:0});
  expect(f.victim.lifeState).toBe('DEAD_WAIT');expect(f.capturer.kills).toBe(1);server.loop.publishSnapshot(room,false,true);
  const victimPage=reverse?b:a,capturerPage=reverse?a:b;
  await expect(victimPage.locator('#death')).toContainText('선의 출발 영토를 잃었어요');await expect(capturerPage.locator('#kill-count')).toHaveText('1');
  await expect.poll(()=>victimPage.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().deaths)).toBe(1);
  await expect.poll(()=>capturerPage.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().kills)).toBe(1);
  const position={...f.victim.position};for(let tick=0;tick<30;tick++)f.tick();server.loop.publishSnapshot(room,false,true);
  expect(f.victim.position).toEqual(position);expect(f.victim.trailCells.size).toBe(0);expect([...m.trailMasks].every(mask=>(mask&(1<<f.victim.slot))===0)).toBe(true);
  await expect.poll(()=>victimPage.evaluate(id=>{const view=(window as any).__HEXHOLD_TEST__.getView();return view.participants.find((p:any)=>p.participantId===id).lifeState;},f.victim.participantId)).toBe('DEAD_WAIT');
  await test.info().attach('movement-capture-trace',{body:JSON.stringify({seed:m.seed,reverse,directContacts:f.directContacts,captureTick:f.captureTick,traces:f.traces,journal:f.journal}),contentType:'application/json'});
  await victimPage.screenshot({path:`evidence/death-cause-home-${reverse?'B':'A'}.png`});
 }finally{await Promise.all(contexts.map(c=>c.close()));await server.close();}
});

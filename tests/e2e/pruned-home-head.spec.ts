import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {MovementCaptureFixture} from '../movement-capture-fixture.js';
import {leaveParticipant} from '../../src/shared/life.js';

for(const scenario of ['pruned','direct','distant-home','distant-trail'] as const)for(const reverse of [false,true])test(`real server and both browsers: ${scenario} home of ${reverse?'B':'A'}`,async({browser})=>{
 const direct=scenario==='direct',distant=scenario.startsWith('distant'),exposed=scenario==='distant-trail';
 process.env.NODE_ENV='test';let now=0;
 const server=createGameServer({autoStart:false,now:()=>now,seed:()=>reverse?17:115,initializeMatch:match=>{for(const p of match.participants)if(p.kind==='BOT')leaveParticipant(match,p);}});
 await new Promise<void>(r=>server.http.listen(5312,'127.0.0.1',r));const mobile={viewport:{width:368,height:796},isMobile:true,hasTouch:true,deviceScaleFactor:2};
 const contexts=await Promise.all([browser.newContext(reverse?{}:mobile),browser.newContext(reverse?mobile:{})]);for(const c of contexts)await c.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const a=await contexts[0].newPage(),b=await contexts[1].newPage();for(const page of [a,b])await page.goto('http://127.0.0.1:5174/?debug=1');
  await a.getByTestId('nickname').fill('A');await b.getByTestId('nickname').fill('B');await a.getByTestId('create').click();await expect(a.locator('#room-panel')).toBeVisible();await b.getByTestId('room-code').fill((await a.locator('#friend-code').textContent())!);await b.getByTestId('join').click();await expect(a.locator('#members')).toContainText('B');await a.getByTestId('start').click();
  now=3000;server.loop.pump();for(const page of [a,b])await expect(page.locator('#hud')).toBeVisible();const room=[...server.rooms.rooms.values()][0],m=room.match!;
  const f=new MovementCaptureFixture(reverse,'classic',m,inputs=>{for(const [id,input]of inputs)room.inputs.set(id,input);now+=1000/30;server.loop.pump();});if(distant)f.runDistantBridgeLoss(exposed);else f.runPrunedHomeHead(direct);
  const record=f.traces.flatMap(t=>t.participants).find(p=>p.participantId===f.victim.participantId&&p.lostTerritory)!;
  const victimPage=reverse?b:a,killerPage=reverse?a:b;
  if(!direct){
   expect(record.claimedTrailCells).toEqual([]);expect(record.homeAnchorBeforePrune).not.toBeNull();expect(record.cut).toBe(false);expect(record.markDeadCalled).toBe(false);expect(f.directContacts).toBe(0);expect(f.victim.lifeState).toBe('ALIVE');expect(f.capturer.kills).toBe(0);
   if(exposed){expect(record.originOwnerBeforePrune).toBe(f.victim.slot+1);expect(record.originOwnerAfterTransfer).toBe(f.victim.slot+1);expect(record.trailCells.length).toBeGreaterThan(0);expect([...f.victim.trailCells]).toEqual(record.trailCells);}
   else{expect(record.headOwnerBeforePrune).toBe(f.victim.slot+1);expect(record.headOwnerAfterTransfer).toBe(f.victim.slot+1);expect(f.victim.trailCells.size).toBe(0);}
   server.loop.publishSnapshot(room,false,true);await expect(victimPage.locator('#death')).toBeHidden();await expect(killerPage.locator('#kill-count')).toHaveText('0');
   await expect.poll(()=>victimPage.evaluate(id=>(window as any).__HEXHOLD_TEST__.getView().participants.find((p:any)=>p.participantId===id).lifeState,f.victim.participantId)).toBe('ALIVE');expect(await victimPage.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().deaths)).toBe(0);
   const views=await Promise.all([a,b].map(page=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView())));expect(views[0].owners).toEqual(views[1].owners);expect(views[0].trailMasks).toEqual(views[1].trailMasks);
   await victimPage.screenshot({path:`evidence/surviving-${scenario}-${reverse?'B':'A'}.png`});return;
  }
  expect(record.trailCells).toEqual([]);expect(record.headHomeNeighborsAfterTransfer).toEqual([]);expect(record.headOwnerAfterTransfer).toBe(f.capturer.slot+1);expect(record.strandedHomeHead).toBe(true);expect(record.markedDead).toBe(true);
  expect(f.directContacts).toBe(0);expect(f.victim.lifeState).toBe('DEAD_WAIT');expect(f.victim.trailCells.size).toBe(0);expect(f.capturer.kills).toBe(1);server.loop.publishSnapshot(room,false,true);
  await expect(victimPage.locator('#death')).toContainText('HOME_CAPTURE');await expect(killerPage.locator('#kill-count')).toHaveText('1');
  await expect.poll(()=>victimPage.evaluate(id=>(window as any).__HEXHOLD_TEST__.getView().participants.find((p:any)=>p.participantId===id).lifeState,f.victim.participantId)).toBe('DEAD_WAIT');await expect.poll(()=>victimPage.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().deaths)).toBe(1);
  const position={...f.victim.position};for(let i=0;i<30;i++)f.tick();expect(f.victim.position).toEqual(position);expect(f.victim.trailCells.size).toBe(0);expect([...m.trailMasks].every(mask=>(mask&(1<<f.victim.slot))===0)).toBe(true);expect(f.capturer.kills).toBe(1);
  await victimPage.screenshot({path:`evidence/${direct?'direct':'pruned'}-home-head-${reverse?'B':'A'}.png`});
 }finally{await Promise.all(contexts.map(c=>c.close()));await server.close();}
});

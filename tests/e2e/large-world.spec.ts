import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createGameServer} from '../../src/server/app.js';
import {decodeTrailMasks} from '../../src/shared/protocol.js';

const output='.local/large-world/browser';
test.beforeAll(()=>mkdirSync(output,{recursive:true}));
for(const radius of [48,56,64])test(`R${radius}/16: static chunk resources, high-slot visuals, culling and frame measurements`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`/tests/fixtures/large-world.html?radius=${radius}`);
 await page.waitForFunction(()=>(window as any).fixture?.scene.resourceState().avatars===16);
 await page.locator('#game-tools-toggle').click();await page.locator('#map-toggle').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.resourceState().minimapUpdateMs)).toBeGreaterThan(0);
 const initial=await page.evaluate(()=>{const {scene,m,COLORS}=(window as any).fixture;return {resources:scene.resourceState(),colors:[0,7,8,15].map(slot=>COLORS[slot]),trailSlots:[0,7,8,15].map(slot=>m.participants[slot].trailCells.size),render:scene.renderState()};});
 expect(initial.colors.every(c=>Number.isFinite(c))).toBe(true);expect(initial.trailSlots.every(n=>n>0)).toBe(true);expect(new Set(initial.colors).size).toBe(4);expect(initial.resources.groundTextures).toBe(1);expect(initial.resources.groundTextureSize.width).toBeLessThan(128);expect(initial.resources.groundTextureSize.height).toBeLessThan(128);
 const series:any[]=[];
 await page.evaluate(()=>{const recording={active:true,times:[] as number[],previous:0};(window as any).chunkFrames=recording;const frame=(at:number)=>{if(recording.previous)recording.times.push(at-recording.previous);recording.previous=at;if(recording.active)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
 // Move a paused camera across multiple world chunks. Geometry/resources remain constant.
 for(const [q,r]of [[-32,0],[-16,0],[0,0],[16,0],[32,0],[0,32],[0,-32],[0,0]]){
  await page.evaluate(({q,r})=>{const {m,scene}=(window as any).fixture;scene.testCamera(Math.sqrt(3)*m.map.side*(q+r/2),1.5*m.map.side*r);},{q,r});
  await page.waitForTimeout(100);const state=await page.evaluate(()=>(window as any).fixture.scene.resourceState());series.push(state);
  expect(state.groundChunks).toBe(initial.resources.groundChunks);expect(state.territoryChunks).toBe(initial.resources.territoryChunks);expect(state.textures).toBe(initial.resources.textures);expect(state.groundTextures).toBe(1);expect(state.groundCells).toBe(initial.resources.groundCells);
 }
 const boundaryFrames=await page.evaluate(()=>{const recording=(window as any).chunkFrames;recording.active=false;return recording.times as number[];});
 const measure=async(culling:boolean)=>{
  await page.evaluate(enabled=>(window as any).fixture.scene.setChunkCulling(enabled),culling);
  return page.evaluate(()=>new Promise<any>(resolve=>{const frames:number[]=[],mini:number[]=[],territory:number[]=[];let previous=0,start=0;
   const frame=(at:number)=>{if(!start)start=at;if(previous)frames.push(at-previous);previous=at;const {scene,m,show}=(window as any).fixture;if(frames.length%6===0){m.tick++;show();}const s=scene.resourceState();mini.push(s.minimapUpdateMs);territory.push(s.territoryRedrawMs);
    if(at-start>=3000){const sorted=[...frames].sort((a,b)=>a-b),mean=frames.reduce((s,n)=>s+n,0)/frames.length;resolve({fps:1000/mean,meanMs:mean,p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],longFrames:frames.filter(n=>n>50).length,frames:frames.length,resources:scene.resourceState(),minimapMs:mini,territoryMs:territory,heap:(performance as any).memory?.usedJSHeapSize??null});}else requestAnimationFrame(frame);};requestAnimationFrame(frame);
  }));
 };
 const culled=await measure(true),allVisible=await measure(false);await page.evaluate(()=>(window as any).fixture.scene.setChunkCulling(true));
 // Renderer stress only: a 500-cell owner delta is not a simulated capture event.
 const ownerBatch=await page.evaluate(()=>(window as any).fixture.paint());expect(ownerBatch.cells).toBe(500);expect(ownerBatch.groundChunks).toBe(initial.resources.groundChunks);
 for(const slot of [0,7,8,15]){await page.evaluate(slot=>{const {scene,m}= (window as any).fixture;scene.testCamera(m.participants[slot].position.x,m.participants[slot].position.y);},slot);await page.waitForTimeout(100);await page.screenshot({path:`${output}/R${radius}-slot${slot}.png`});}
 await page.evaluate(()=>(window as any).fixture.kill(15));await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.combatState().kills)).toBe(1);
 await page.evaluate(()=>(window as any).fixture.results());await expect(page.locator('#result-rows tr')).toHaveCount(16);expect(errors).toEqual([]);
 writeFileSync(`${output}/R${radius}.json`,JSON.stringify({condition:'AUTOMATED desktop headless Chromium; controlled Phaser/wire fixture, 500-cell owner delta is render stress only; no Android performance claim',initial,series,boundaryFrames,ownerBatch,culled,allVisible,errors},null,2));
});
test('R56/16 normal practice starts 1 HUMAN + 15 BOT with camera follow, minimap and all ranking rows',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?experimentMapRadius=56&experimentSlots=16&experimentSeed=4');await page.getByTestId('nickname').fill('큰 맵');await page.getByTestId('practice').click();
 await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#population')).toHaveText('1 HUMAN · 15 BOT');await expect(page.locator('#ranking li')).toHaveCount(16);
 await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getResourceState().avatars)).toBe(16);
 await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().tick)).toBeGreaterThan(90);
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState().centerError)).toBeLessThan(1);await page.locator('#game-tools-toggle').click();await page.locator('#map-toggle').click();await expect(page.locator('#minimap')).toBeVisible();expect(errors).toEqual([]);
 await page.screenshot({path:`${output}/practice-R56-16.png`});
});
test('R56/16 two browsers share decoded board and states in a real 2 HUMAN + 14 BOT Classic room',async({browser})=>{
 process.env.NODE_ENV='test';const errors:string[]=[],server=createGameServer({config:{mapRadius:56,maxSlots:16},seed:()=>4});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);for(const c of contexts)await c.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{const a=await contexts[0].newPage(),b=await contexts[1].newPage();for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/');await b.goto('/');await a.getByTestId('nickname').fill('A');await b.getByTestId('nickname').fill('B');await a.getByTestId('create').click();await expect(a.locator('#room-panel')).toBeVisible();
  await b.getByTestId('room-code').fill((await a.locator('#friend-code').textContent())!);await b.getByTestId('join').click();await expect(a.locator('#members')).toContainText('B');await a.getByTestId('start').click();
  for(const p of [a,b]){await expect(p.locator('#hud')).toBeVisible({timeout:15000});await expect(p.locator('#population')).toHaveText('2 HUMAN · 14 BOT');}
  await expect.poll(()=>a.evaluate(()=>(window as any).__HEXHOLD_TEST__.history.length)).toBeGreaterThan(15);
  const ha=await a.evaluate(()=>(window as any).__HEXHOLD_TEST__.history),hb=await b.evaluate(()=>(window as any).__HEXHOLD_TEST__.history),peers=new Map(hb.map((s:any)=>[s.snapshotSeq,s])),common=ha.filter((s:any)=>peers.has(s.snapshotSeq));expect(common.length).toBeGreaterThan(5);
  for(const s of common){const peer:any=peers.get(s.snapshotSeq);expect(s.tick).toBe(peer.tick);expect(s.matchId).toBe(peer.matchId);expect(s.owners).toBe(peer.owners);expect(Array.from(decodeTrailMasks(s.trailMasks,9577)).join(',')).toBe(Array.from(decodeTrailMasks(peer.trailMasks,9577)).join(','));expect(s.participants).toEqual(peer.participants);}
  const last=common.at(-1);expect(last.participants.find((p:any)=>p.slot===15)).toBeTruthy();expect(last.gameMode.id).toBe('classic');expect(errors).toEqual([]);
  const sizes=ha.map((s:any)=>Buffer.byteLength(JSON.stringify(s))).sort((a:number,b:number)=>a-b),meanBytes=sizes.reduce((s:number,n:number)=>s+n,0)/sizes.length;
  writeFileSync(`${output}/online.json`,JSON.stringify({commonSnapshots:common.length,matchId:last.matchId,tick:last.tick,participants:last.participants.length,bytes:{mean:meanBytes,p95:sizes[Math.floor(sizes.length*.95)],payloadBytesPerSecondAt10Hz:meanBytes*10},errors},null,2));
 }finally{await Promise.all(contexts.map(c=>c.close()));await server.close();}
});
test('production client and server keep current R56/16 defaults despite experiment overrides',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));await page.goto('http://127.0.0.1:3010/?experimentMapRadius=48&experimentSlots=8&experimentSeed=4');await page.getByTestId('practice').click();
 await expect(page.locator('#population')).toHaveText('1 HUMAN · 15 BOT');await expect(page.locator('#score-detail')).toContainText('/ 9577칸');await page.getByTestId('leave').click();await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();
 await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#population')).toHaveText('1 HUMAN · 15 BOT');await expect(page.locator('#score-detail')).toContainText('/ 9577칸');
});

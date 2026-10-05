import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const output='.local/territory-effects',styles=['WAVE_COLLAPSE','POWER_DOWN','EDGE_CRUMBLE'] as const;
const fixture='/tests/fixtures/territory-effects.html';
test.beforeAll(()=>{mkdirSync(output,{recursive:true});mkdirSync('.local/capture-effects',{recursive:true});});
async function load(page:any){await page.goto(fixture);await page.waitForFunction(()=>!!(window as any).fixture&&(window as any).fixture.scene.territoryEffectState()!==null);}
const stats=(a:number[])=>{const s=[...a].sort((a,b)=>a-b);return {mean:a.reduce((n,v)=>n+v,0)/a.length,p95:s[Math.floor(s.length*.95)],p99:s[Math.floor(s.length*.99)],max:s.at(-1),samples:a.length};};
test('known state wins, slot 15 and simultaneous deaths, reset and layer order',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error: '+e.message);});await load(page);
 await page.evaluate(()=>{const f=(window as any).fixture;f.replay(true);f.freezeAt(0);});
 await page.waitForTimeout(80);
 const initial=await page.evaluate(()=>{const {m,scene,resources}=(window as any).fixture;return {state:scene.territoryEffectState(),resources:resources(),head:m.participants[15].position,burst:(scene as any).combat.bursts[0].position,neutral:m.owners.every((o:number)=>o===0),origin:m.map.byKey.get('0,0')};});
 expect(initial.state.active).toBe(2);expect(initial.state.origins.map((e:any)=>e.slot)).toEqual([15,3]);expect(initial.state.origins[0].cellId).toBe(initial.origin);expect(initial.burst).toEqual(initial.head);expect(initial.neutral).toBe(true);expect(initial.state.graphics).toBe(51);expect(initial.state.depth).toBe(.5);
 for(const [q,r]of [[-32,0],[32,0],[0,32],[0,-32],[0,0]]){await page.evaluate(({q,r})=>(window as any).fixture.camera(q,r),{q,r});await page.waitForTimeout(50);const current=await page.evaluate(()=>(window as any).fixture.resources());expect(current.effect.graphics).toBe(initial.state.graphics);expect(current.graphics).toBe(initial.resources.graphics);expect(current.render.textures).toBe(initial.resources.render.textures);}
 const hardware=await page.evaluate(()=>{const gl=(window as any).fixture.scene.game.renderer.gl,debug=gl?.getExtension("WEBGL_debug_renderer_info");return {agent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):"unavailable",maxTextureSize:gl?.getParameter(gl.MAX_TEXTURE_SIZE)};});
 expect(await page.evaluate(()=>{const scene=(window as any).fixture.scene;return [...scene.chunks.values()].every((g:any)=>g.depth>scene.territoryEffectState().depth);})).toBe(true);
 await page.evaluate(()=>(window as any).fixture.show());expect(await page.evaluate(()=>(window as any).fixture.scene.territoryEffectState().played)).toBe(2);
 const before=initial.state.cells;await page.evaluate(()=>(window as any).fixture.occlude());
 const after=await page.evaluate(()=>(window as any).fixture.scene.territoryEffectState());expect(after.cells).toBe(before-2);expect(after.cancelledCells).toBe(2);
 await page.evaluate(()=>(window as any).fixture.show(true));expect(await page.evaluate(()=>(window as any).fixture.scene.territoryEffectState().active)).toBe(0);
 await page.evaluate(()=>(window as any).fixture.disable());expect(await page.evaluate(()=>(window as any).fixture.scene.territoryEffectState().graphics)).toBe(0);
 expect(errors).toEqual([]);writeFileSync(output+'/correctness.json',JSON.stringify({initial,after,hardware,errors},null,2));
});
test('100 completed replays per style retain stable pools, listeners, timers and textures',async({page})=>{
 await load(page);
 const data=await page.evaluate((styles)=>{
  const f=(window as any).fixture,rows:any[]=[];
  for(const style of styles){f.select(style,1000);f.end();const before=f.resources();
   for(let i=0;i<100;i++){f.replay(i%10===0);f.end();}
   const after=f.resources();rows.push({style,before,after});
  }
  const destroyed=f.destroy();return {rows,destroyed};
 },styles);
 for(const {before,after}of data.rows){expect(after.objects).toBe(before.objects);expect(after.graphics).toBe(before.graphics);expect(after.listeners).toBe(before.listeners);expect(after.timers).toBe(before.timers);expect(after.tweens).toBe(0);expect(after.particles).toBe(0);expect(after.effect.active).toBe(0);expect(after.effect.visibleGraphics).toBe(0);expect(after.render.textures).toBe(before.render.textures);}
 expect(data.destroyed.graphics).toBe(0);expect(data.destroyed.active).toBe(0);writeFileSync(output+'/leaks.json',JSON.stringify(data,null,2));
});
for(const style of styles)test(style+' measures 50/250/1000 cells with real frame timing',async({page})=>{
 await load(page);const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error: '+e.message);});const rows:any[]=[];
 for(const size of [50,250,1000]){
  const row=await page.evaluate(({style,size})=>new Promise<any>(resolve=>{
   const f=(window as any).fixture;f.select(style,size);f.end();const baseline=f.resources();f.replay();const initial=f.resources(),frames:number[]=[],update:number[]=[],redraw:number[]=[],prepare:number[]=[initial.effect.lastPrepareMs];
   let start=0,previous=0,lastReplay=0,peakCells=0,peakGraphics=0,lastRedraw=-1;
   const frame=(at:number)=>{if(!start){start=at;lastReplay=at;}if(previous)frames.push(at-previous);previous=at;
    if(at-lastReplay>=800){f.replay();lastReplay=at;prepare.push(f.scene.territoryEffectState().lastPrepareMs);}
    const s=f.scene.territoryEffectState();update.push(s.updateMs);if(s.redraws!==lastRedraw){redraw.push(s.redrawMs);lastRedraw=s.redraws;}peakCells=Math.max(peakCells,s.drawnCells);peakGraphics=Math.max(peakGraphics,s.visibleGraphics);
    if(at-start>=3400){f.end();resolve({style,size,baseline,initial,final:f.resources(),frames,update,redraw,prepare,peakCells,peakGraphics});}else requestAnimationFrame(frame);
   };requestAnimationFrame(frame);
  }),{style,size});
  expect(row.initial.effect.cells).toBe(size);expect(row.initial.effect.graphics).toBe(51);expect(row.final.effect.active).toBe(0);expect(row.final.effect.graphics).toBe(51);expect(row.final.render.textures).toBe(row.baseline.render.textures);expect(row.final.objects).toBe(row.baseline.objects);expect(row.peakCells).toBeGreaterThan(0);
  rows.push({...row,frameStats:stats(row.frames),updateStats:stats(row.update),redrawStats:stats(row.redraw),prepareStats:stats(row.prepare),over50ms:row.frames.filter((n:number)=>n>50).length});
 }
 expect(errors).toEqual([]);writeFileSync(output+'/'+style+'-performance.json',JSON.stringify({condition:'AUTOMATED headless Chromium / controlled R56/16 scene, overview camera, four repeated deaths in each 3.4s window; no mobile approval',rows,errors},null,2));
});
for(const style of styles)test(style+' captures the same medium scene at 0/200/400/end',async({page})=>{
 await load(page);const photos:string[]=[];
 for(const elapsed of [0,200,400,700]){
  await page.evaluate(({style,elapsed})=>{const f=(window as any).fixture;f.select(style,250);f.freezeAt(elapsed);},{style,elapsed});await page.waitForTimeout(80);
  const file=output+'/'+style+'-'+elapsed+'.png';await page.screenshot({path:file});photos.push(file);
 }
 writeFileSync(output+'/'+style+'-sequence.json',JSON.stringify({style,cells:250,times:[0,200,400,700],photos},null,2));
});
for(const [query,style]of [['wave','WAVE_COLLAPSE'],['power','POWER_DOWN'],['edge','EDGE_CRUMBLE']])test(style+' works during real R56/16 practice, deaths and camera movement',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error: '+e.message);});await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?experimentMapRadius=56&experimentSlots=16&experimentSeed=4&experimentTerritoryEffect='+query);
 await expect(page.getByTestId('practice')).toBeVisible({timeout:10000});await page.getByTestId('practice').click();await expect(page.locator('#population')).toHaveText('1 HUMAN · 15 BOT');
 await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().tick)).toBeGreaterThan(90);
 const data=await page.evaluate(async()=>{const hook=(window as any).__HEXHOLD_TEST__,p=hook.getPractice(),m=p.match;
  // Deliberate confirmed deaths amid the ordinary practice loop: fixture stress,
  // not proof that a player naturally earned simultaneous kills.
  const life=await import('/src/shared/life.ts' as string),game=await import('/src/shared/game.ts' as string);p.setPaused(true);
  const slots=[3,8,15].filter(slot=>m.participants.find((v:any)=>v.slot===slot).lifeState==='ALIVE');
  for(const slot of slots){const victim=m.participants.find((v:any)=>v.slot===slot);life.markDead(m,victim,'TRAIL_CUT',m.participants[0],{cause:'EXISTING_TRAIL_CONTACT',cellId:victim.cellId});}
  m.tick++;p.publish(game.buildView(m),p.selfId);const after=hook.getTerritoryEffectState();p.setPaused(false);return {slots,after,tick:m.tick};
 });
 expect(data.slots).toContain(15);expect(data.after.style).toBe(style);expect(data.after.active).toBeGreaterThan(0);expect(data.after.active).toBeLessThanOrEqual(4);
 const states:any[]=[];for(const [x,y]of [[-900,0],[0,0],[900,0],[0,900]]){await page.evaluate(({x,y})=>(window as any).__HEXHOLD_TEST__.camera(x,y),{x,y});await page.waitForTimeout(120);states.push(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getTerritoryEffectState()));}
 expect(states.every(s=>s.graphics===51)).toBe(true);await page.waitForTimeout(700);expect(errors).toEqual([]);
 writeFileSync(output+'/'+style+'-practice.json',JSON.stringify({condition:'Real 1H15B PracticeSession; confirmed deaths deliberately injected with shared markDead under test-only hook while ordinary simulation resumes',data,states,errors},null,2));
});
test('production ignores alternative queries and uses the chosen Wave',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 expect((await page.request.get('http://127.0.0.1:3010/tests/fixtures/territory-effects.html')).status()).toBe(404);
 for(const query of ['wave','power','edge']){
  await page.goto('http://127.0.0.1:3010/?experimentTerritoryEffect='+query+'&experimentCaptureEffect=bloom');await expect(page.getByTestId('practice')).toBeVisible({timeout:10000});await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#field')).toHaveAttribute('data-territory-effect','WAVE_COLLAPSE');await expect(page.locator('#field')).toHaveAttribute('data-capture-effect','NONE');await expect(page.locator('#population')).toHaveText('1 HUMAN · 7 BOT');
 }
});
test('phone-size comparison controls and field fit portrait and landscape',async({page})=>{
 const sizes=[{width:393,height:852},{width:852,height:393}],rows:any[]=[];
 for(const viewport of sizes){
  await page.setViewportSize(viewport);await load(page);
  for(const selector of ['header','#replay','footer','#field','#minimap']){
   const rect=await page.locator(selector).boundingBox();expect(rect).not.toBeNull();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.y).toBeGreaterThanOrEqual(0);
   expect(rect!.x+rect!.width).toBeLessThanOrEqual(viewport.width+1);expect(rect!.y+rect!.height).toBeLessThanOrEqual(viewport.height+1);
  }
  await page.getByRole('button',{name:'Large · 1,000'}).click();await page.getByRole('button',{name:'Power Down',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).fixture.scene.territoryEffectState().style)).toBe('POWER_DOWN');
  await page.evaluate(()=>(window as any).fixture.freezeAt(120));await page.waitForTimeout(80);const file=output+'/phone-'+viewport.width+'.png';await page.screenshot({path:file});rows.push({viewport,file,resources:await page.evaluate(()=>(window as any).fixture.resources())});
 }
 writeFileSync(output+'/phone-layout.json',JSON.stringify({condition:'AUTOMATED viewport layout; not a physical phone performance measurement',rows},null,2));
});
test('Capture Bloom uses real R56/16 practice captures, slot 15, then releases drawing without resource growth',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?experimentMapRadius=56&experimentSlots=16&experimentSeed=4&experimentCaptureEffect=bloom');
 await page.getByTestId('practice').click();await expect(page.locator('#population')).toHaveText('1 HUMAN · 15 BOT');
 await expect(page.locator('#field')).toHaveAttribute('data-territory-effect','WAVE_COLLAPSE');
 await expect(page.locator('#field')).toHaveAttribute('data-capture-effect','CAPTURE_PULSE');
 const result=await page.evaluate(async()=>{
  const hook=(window as any).__HEXHOLD_TEST__,p=hook.getPractice(),m=p.match;p.setPaused(true);
  const game=await import('/src/shared/game.ts' as string),engine=await import('/src/shared/engine.ts' as string);
  const territory=await import('/src/shared/territory.ts' as string),hex=await import('/src/shared/hex.ts' as string);
  const capturers=[m.participants[0],m.participants[15]];m.events=[];
  for(const capturer of capturers){territory.clearTrail(m,capturer);const home=m.map.cells.find((cell:any)=>m.owners[cell.id]===capturer.slot+1);if(!home||capturer.lifeState!=='ALIVE')throw Error('Capture fixture needs a living participant with home');capturer.cellId=home.id;capturer.position={...home.center};}
  const targets=capturers.map(capturer=>m.map.cells.filter((cell:any)=>hex.hexDistance(cell,m.map.cells[capturer.cellId])<=4&&m.owners[cell.id]!==capturer.slot+1&&m.trailMasks[cell.id]===0).map((cell:any)=>cell.id));
  for(let i=0;i<capturers.length;i++)for(const id of targets[i])territory.addTrail(m,capturers[i],id);
  m.tick++;p.publish(game.buildView(m),p.selfId);
  const before={capture:hook.getCaptureEffectState(),resources:hook.getResourceState()},old=m.owners.slice();
  engine.applySimultaneousCaptures(m,capturers);m.tick++;p.publish(game.buildView(m),p.selfId);
  const capture=hook.getCaptureEffectState(),expected=m.owners.reduce((sum:number,owner:number,id:number)=>sum+Number((owner===1||owner===16)&&old[id]!==owner&&m.trailMasks[id]===0),0);
  return {before,capture,expected,confirmed:m.events.filter((e:any)=>e.type==='CAPTURE').map((e:any)=>e.participantId),slots:capturers.map(v=>v.slot)};
 });
 expect(result.slots).toEqual([0,15]);expect(result.confirmed).toHaveLength(2);expect(result.capture.active).toBe(2);
 expect(result.capture.captures.map((c:any)=>c.slot).sort((a:number,b:number)=>a-b)).toEqual([0,15]);expect(result.capture.cells).toBe(result.expected);expect(result.expected).toBeGreaterThan(0);
 expect(result.capture.graphics).toBe(51);expect(result.capture.depth).toBe(2);
 await page.waitForTimeout(70);const during=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCaptureEffectState());expect(during.drawnCells).toBeGreaterThan(0);
 await page.waitForTimeout(700);
 const end=await page.evaluate(()=>{const hook=(window as any).__HEXHOLD_TEST__;return {capture:hook.getCaptureEffectState(),resources:hook.getResourceState()};});
 expect(end.capture.active).toBe(0);expect(end.capture.visibleGraphics).toBe(0);expect(end.capture.drawnCells).toBe(0);
 expect(end.capture.graphics).toBe(result.before.capture.graphics);expect(end.resources.textures).toBe(result.before.resources.textures);
 expect(end.resources.avatars).toBe(result.before.resources.avatars);expect(errors).toEqual([]);
 writeFileSync('.local/capture-effects/capture-practice.json',JSON.stringify({condition:'Real PracticeSession; forced closed capture paths resolved by unchanged shared capture engine under test-only hook',result,during,end,errors},null,2));
});
test('Capture Bloom replay works in the existing mobile fixture',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:393,height:852});await load(page);
 await page.getByRole('button',{name:'Capture Pulse 재생'}).click();
 const state=await page.evaluate(()=>{const f=(window as any).fixture,c=(f.scene as any).captureEffects;const update=c.update.bind(c);c.update=(now:number,view:any,culling:boolean)=>update((c.model.effects[0]?.startedAt??now)+110,view,culling);
  return {capture:f.scene.captureEffectState(),actualOwned:Array.from(f.m.owners).filter(o=>o===16).length};});
 expect(state.capture.active).toBe(1);expect(state.capture.captures[0].slot).toBe(15);expect(state.capture.cells).toBeGreaterThan(0);
 expect(state.actualOwned).toBeGreaterThanOrEqual(state.capture.cells);
 await page.waitForTimeout(80);await page.screenshot({path:'.local/capture-effects/capture-bloom-phone.png'});expect(errors).toEqual([]);
});

test('enemy bridge theft has a pulse; surviving victim disconnected territory has a loss wave',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:393,height:852});await load(page);
 const result=await page.evaluate(()=>{
  const f=(window as any).fixture;f.steal();f.freezeAt(240);
  const c=(f.scene as any).captureEffects,update=c.update.bind(c),born=c.model.effects[0].startedAt;
  c.update=(now:number,view:any,culling:boolean)=>update(born+60,view,culling);(window as any).__captureFixtureUpdate=update;
  return {capture:f.scene.captureEffectState(),loss:f.scene.territoryEffectState(),victim:f.m.participants[15].lifeState,combat:f.scene.combatState(),before:f.resources()};
 });
 expect(result.victim).toBe('ALIVE');expect(result.combat.active).toBe(0);
 expect(result.capture.captures[0].stolenCount).toBeGreaterThan(0);expect(result.capture.captures[0].neutralCount).toBeGreaterThan(0);
 expect(result.loss.origins[0].kind).toBe('CAPTURE_LOSS');expect(result.loss.origins[0].slot).toBe(15);expect(result.loss.cells).toBeGreaterThan(30);
 await page.waitForTimeout(80);
 const during=await page.evaluate(()=>{const f=(window as any).fixture;return {capture:f.scene.captureEffectState(),loss:f.scene.territoryEffectState()};});
 expect(during.capture.drawnEdges).toBeGreaterThan(0);expect(during.loss.drawnCells).toBeGreaterThan(0);
 await page.screenshot({path:'.local/capture-revision/steal-phone.png'});
 const end=await page.evaluate(()=>{
  const f=(window as any).fixture,c=(f.scene as any).captureEffects;c.update=(window as any).__captureFixtureUpdate;c.update(c.model.effects[0].startedAt+1000,f.scene.view,true);f.end();
  return {capture:f.scene.captureEffectState(),loss:f.scene.territoryEffectState(),resources:f.resources()};
 });
 expect(end.capture.active).toBe(0);expect(end.capture.visibleGraphics).toBe(0);expect(end.loss.active).toBe(0);
 expect(end.resources.graphics).toBe(result.before.graphics);expect(end.resources.objects).toBe(result.before.objects);expect(end.resources.render.textures).toBe(result.before.render.textures);
 expect(errors).toEqual([]);
 writeFileSync('.local/capture-revision/steal-browser.json',JSON.stringify({condition:'Shared capture engine on a prepared connected bridge/island fixture; no forced DEATH',result,during,end,errors},null,2));
});

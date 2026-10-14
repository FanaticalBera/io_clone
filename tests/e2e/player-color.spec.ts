import {test,expect,type Page} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {MARKER_COLORS} from '../../src/client/catalog.js';
import {FIELD} from '../../src/client/theme.js';
test.use({isMobile:true,hasTouch:true,deviceScaleFactor:3});
const colors=MARKER_COLORS.filter(c=>c.value!==null);
let errors:string[]=[];test.beforeEach(async({page,context})=>{errors=[];const track=(p:Page)=>p.on('pageerror',e=>errors.push(e.message));track(page);context.on('page',track);});test.afterEach(()=>expect(errors).toEqual([]));
async function store(page:Page,method:string,...args:any[]){return page.evaluate(async({method,args})=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore();try{return await (s as any)[method](...args);}finally{s.dispose();}},{method,args});}
async function seed(page:Page,ownColors=false){
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));await page.goto('/?experimentSeed=4&experimentSlots=16');await expect(page.locator('#menu-coins')).toHaveText('0');
 await page.evaluate(async({ownColors})=>{const {MARKER_COLORS}=await import('/src/client/catalog.ts' as string),p=await (window as any).__HEXHOLD_TEST__.profile();p.coins=15000;p.stats.totalKills=12;p.inventory.ownedMarkerIds.push('cat');p.inventory.equippedMarkerId='cat';if(ownColors){p.inventory.ownedMarkerColorIds=MARKER_COLORS.map((c:any)=>c.id);p.inventory.equippedMarkerColorId='violet';}
 await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('hexhold.player-profile',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(p,'profile');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});},{ownColors});await page.reload();await expect(page.locator('#menu-coins')).toHaveText('15,000');
}
async function pausedPractice(page:Page){await page.getByTestId('practice').click();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice()!=null)).toBe(true);await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().setPaused(true));await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().length)).toBe(16);}

test('all Player Color swatches buy/equip and restore using existing inventory at three mobile sizes',async({page})=>{
 test.setTimeout(120000);await seed(page);await page.locator('#shop-open').click();await page.locator('#shop-colors').click();await expect(page.locator('#shop-colors')).toHaveText('색상');await expect(page.locator('.shop-color-swatch')).toHaveCount(33);
 for(const size of [{width:844,height:390},{width:640,height:320},{width:568,height:320}]){
  await page.setViewportSize(size);await page.locator('[data-product-id="slate"]').click();await expect(page.locator('#shop-item-note')).toContainText('영토 · 꼬리');
  for(const id of ['shop-close','shop-colors','shop-action','shop-item-name','shop-preview']){const b=(await page.locator('#'+id).boundingBox())!;expect(b.x+b.width).toBeLessThanOrEqual(size.width);expect(b.y+b.height).toBeLessThanOrEqual(size.height);expect(b.y).toBeGreaterThanOrEqual(0);}
  expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);await page.screenshot({path:'evidence/player-color-v2-shop-'+size.width+'x'+size.height+'.png'});
 }
 const rawBefore=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());
 for(const color of colors){const card=page.locator('[data-product-id="'+color.id+'"]');await expect(card.locator('.shop-color-swatch')).toHaveCSS('background-color','rgb('+[(color.value!>>>16)&255,(color.value!>>>8)&255,color.value!&255].join(', ')+')');await card.click();await expect(page.locator('#shop-action')).toHaveText('구매 · 300 코인');await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착');await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착 중');await expect(card.locator('small')).toHaveText('장착 중');}
 await page.locator('#shop-close').click();await page.reload();const saved=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());expect(saved.coins).toBe(5400);expect(saved.inventory.ownedMarkerColorIds).toHaveLength(33);expect(saved.inventory.equippedMarkerColorId).toBe('copper');expect(saved.stats).toEqual(rawBefore.stats);expect(saved.processedRuns).toEqual(rawBefore.processedRuns);expect(saved.worlds).toEqual(rawBefore.worlds);expect(saved.version).toBe(1);await page.locator('#shop-open').click();await page.locator('#shop-colors').click();await expect(page.locator('[data-product-id="copper"] small')).toHaveText('장착 중');await page.locator('#shop-close').click();
});

test('all thirty-two colors drive actual marker, territory, trail, shields and effects without changing slot/AI state',async({page})=>{
 test.setTimeout(90000);await seed(page,true);await page.setViewportSize({width:844,height:390});await pausedPractice(page);
 const setup=await page.evaluate(async()=>{const t=(window as any).__HEXHOLD_TEST__,m=t.getPractice().match,h=m.participants[0],{addTrail}=await import('/src/shared/territory.ts' as string);const id=m.map.cells.find((c:any)=>m.owners[c.id]===0&&c.neighbors.some((n:number)=>n>=0&&m.owners[n]===1)).id;addTrail(m,h,id);t.showPracticeView();return{matchId:m.matchId,identities:m.participants.map((p:any)=>[p.participantId,p.slot]),owners:[...m.owners],trails:[...m.trailMasks],tick:m.tick};});
 for(const color of [...colors,{id:'slot',value:0x16cdb1}]){
  await store(page,'equip','marker-color',color.id);await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.participantId==='local-human')?.bodyColor)).toBe(color.value);
  const state=await page.evaluate(trailAlpha=>{
   const t=(window as any).__HEXHOLD_TEST__,s=t.getScene(),m=t.getPractice().match;
   const style=(rgb:number,alpha:number)=>[...s.chunks.values()].some((g:any)=>g.commandBuffer.some((v:number,i:number,b:number[])=>v===7&&b[i+1]===rgb&&b[i+2]===alpha));
   const rgba=t.getPlayerColors(),local=t.getMarkerState().find((p:any)=>p.participantId==='local-human'),self=m.participants[0];
   // Land now uses an atlas and Blitter tiles. Check the actual fill pixel and the tile reference,
   // rather than requiring the former Graphics commands. Trails still use Graphics.
   const texture=s.textures.get(s.landKey),frame=texture.get('top'+self.slot),canvas=texture.getSourceImage() as HTMLCanvasElement;
   const pixel=canvas.getContext('2d')!.getImageData(Math.round(-s.landBox.minX),frame.cutY+Math.round(-s.landBox.minY),1,1).data;
   const tileColor=pixel[0]<<16|pixel[1]<<8|pixel[2];
   const territory=tileColor===local.bodyColor&&pixel[3]===255&&[...s.landChunks.values()].some((land:any)=>land.children.list.some((bob:any)=>bob.frame===frame));
   return{local,colors:rgba,territory,trail:style(local.bodyColor,trailAlpha),shield:s.avatars.get('local-human').shield.strokeColor,identities:m.participants.map((p:any)=>[p.participantId,p.slot]),owners:[...m.owners],trails:[...m.trailMasks],tick:m.tick,bots:t.getMarkerState().filter((p:any)=>!p.local)};
  },FIELD.trailAlpha);
  expect(state.local).toMatchObject({local:true,slotColor:color.value,bodyColor:color.value,selfBase:true});expect(state.territory).toBe(true);expect(state.trail).toBe(true);expect(state.shield).toBe(color.value);expect(new Set(state.colors).size).toBe(16);expect(state.colors.slice(1)).not.toContain(color.value);expect(new Set(state.bots.map((p:any)=>p.markerId)).size).toBe(15);expect(state.bots.every((p:any)=>p.bodyColor===p.slotColor&&!p.selfBase)).toBe(true);expect(state.identities).toEqual(setup.identities);expect(state.owners).toEqual(setup.owners);expect(state.trails).toEqual(setup.trails);expect(state.tick).toBe(setup.tick);
 }
 await store(page,'equip','marker-color','violet');
 for(const size of [{width:844,height:390},{width:640,height:320},{width:568,height:320}]){await page.setViewportSize(size);await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState().viewport.width)).toBe(size.width);await page.screenshot({path:'evidence/player-color-v2-game-'+size.width+'x'+size.height+'.png'});expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);}
 const sampleBots=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().filter((p:any)=>!p.local).slice(0,3).map((p:any)=>({id:p.participantId,markerId:p.markerId})));
 for(const sample of sampleBots){
  await page.evaluate(id=>{const t=(window as any).__HEXHOLD_TEST__,bot=t.getView().participants.find((p:any)=>p.participantId===id);t.camera(bot.position.x,bot.position.y);},sample.id);
  await page.waitForTimeout(80);await page.screenshot({path:'evidence/player-color-v2-bot-'+sample.markerId+'.png'});
 }
 const capture=await page.evaluate(async()=>{const t=(window as any).__HEXHOLD_TEST__,s=t.getScene(),m=t.getPractice().match,h=m.participants[0],{setOwner}=await import('/src/shared/territory.ts' as string);const cell=m.map.cells.find((c:any)=>m.owners[c.id]===0&&m.trailMasks[c.id]===0&&c.neighbors.some((n:number)=>n>=0&&m.owners[n]===1)).id;m.tick++;setOwner(m,cell,1);m.events.push({eventId:m.matchId+':color-capture',tick:m.tick,type:'CAPTURE',participantId:h.participantId,lifeId:h.lifeId});t.showPracticeView();return s.captureEffects.model.effects.map((e:any)=>e.color);});expect(capture).toContain(0xa180f4);
 const botBefore=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().filter((p:any)=>!p.local).map((p:any)=>[p.participantId,p.markerId]));
 const deathColor=await page.evaluate(async()=>{const t=(window as any).__HEXHOLD_TEST__,m=t.getPractice().match;t.getScene().setTerritoryEffect('WAVE_COLLAPSE');const {markDead}=await import('/src/shared/life.ts' as string);m.tick++;markDead(m,m.participants[0],'WALL_HIT');t.showPracticeView();return t.getScene().territoryEffects.model.effects.map((e:any)=>e.color);});expect(deathColor).toContain(0xa180f4);await expect(page.locator('#run-results')).toBeVisible();await page.locator('#run-retry').click();
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().match.matchId)).toBe(setup.matchId);expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().filter((p:any)=>!p.local).map((p:any)=>[p.participantId,p.markerId]))).toEqual(botBefore);
 await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await store(page,'equip','marker-color','coral');await pausedPractice(page);const fresh=await page.evaluate(()=>{const t=(window as any).__HEXHOLD_TEST__;return{matchId:t.getPractice().match.matchId,markers:t.getMarkerState().filter((p:any)=>!p.local).map((p:any)=>p.markerId),colors:t.getPlayerColors(),count:t.getView().owners.length};});expect(fresh.matchId).not.toBe(setup.matchId);expect(fresh.markers).not.toEqual(botBefore.map((p:any)=>p[1]));expect(fresh.colors[0]).toBe(0xff7084);expect(new Set(fresh.colors).size).toBe(16);expect(fresh.count).toBe(9577);
});

test('online presentation reserves local color in slot 15 and leaves remote HUMAN appearance/protocol local',async({page})=>{
 await seed(page,true);await pausedPractice(page);
 const result=await page.evaluate(async()=>{const t=(window as any).__HEXHOLD_TEST__,{createMatch,buildView}=await import('/src/shared/game.ts' as string),{botSpecs}=await import('/src/shared/bot.ts' as string),{packSnapshot,unpackSnapshot}=await import('/src/shared/protocol.ts' as string);const specs=botSpecs(16).map((p:any)=>p.slot===15?{...p,participantId:'online-self',kind:'HUMAN'}:p.slot===2?{...p,participantId:'remote-human',kind:'HUMAN'}:p),m=createMatch({maxSlots:16},5,specs,'online-colors'),view=buildView(m),before=structuredClone(view);const raw=packSnapshot(view,1,Date.now(),'online-self'),restored=unpackSnapshot(raw);t.getScene().setView(restored,'online-self',true,true);const colors=t.getPlayerColors();return{colors,states:t.getMarkerState(),unchanged:JSON.stringify(view)===JSON.stringify(before),protocolFields:Object.keys(raw.participants[15]),positions:view.participants.map((p:any)=>[p.participantId,p.slot])};});
 expect(result.colors[15]).toBe(0xa180f4);expect(new Set(result.colors).size).toBe(16);expect(result.states.find((p:any)=>p.participantId==='online-self')).toMatchObject({markerId:'cat',bodyColor:0xa180f4,slotColor:0xa180f4});expect(result.states.find((p:any)=>p.participantId==='remote-human')).toMatchObject({markerId:'default',bodyColor:result.colors[2],local:false});expect(result.unchanged).toBe(true);expect(result.protocolFields).not.toContain('playerColor');expect(result.protocolFields).not.toContain('markerId');
});


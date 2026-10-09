import {test,expect,type Page} from '@playwright/test';
const profile=(page:Page)=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());
async function store(page:Page,method:string,...args:unknown[]){
 return page.evaluate(async({method,args})=>{
  const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore();
  try{return await (s as any)[method](...args);}finally{s.dispose();}
 },{method,args});
}
test('explicit claim gives one free cat, equips it, preserves wallet data and survives reload',async({page})=>{
 await page.goto('/');await expect(page.locator('#menu-coins')).toHaveText('0');
 await page.evaluate(async()=>{
  const p=await (window as any).__HEXHOLD_TEST__.profile();p.coins=321;p.stats.totalKills=12;p.inventory.ownedMarkerColorIds.push('violet');p.inventory.equippedMarkerColorId='violet';
  p.processedRuns.push({runId:'saved:h:life:1',baseCoins:5,territoryCoins:6,killCoins:3,clearBonusCoins:0,totalCoins:14});
  p.worlds.push({matchId:'saved',participants:[{participantId:'h',ownerId:'prior',initialTerritoryCells:7,observedLifeId:1,paidLifeId:1,closed:true}]});
  await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('hexhold.player-profile',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(p,'profile');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
 });
 const before=await profile(page);await page.goto('/?testMarkerGift=cat&experimentSeed=4');await expect(page).not.toHaveURL(/testMarkerGift/);
 const after=await profile(page),{inventory,...core}=after,{inventory:oldInventory,...oldCore}=before;
 expect(core).toEqual(oldCore);expect(inventory).toEqual({...oldInventory,ownedMarkerIds:['default','cat'],equippedMarkerId:'cat'});
 await page.goto('/?testMarkerGift=cat');await expect(page).not.toHaveURL(/testMarkerGift/);expect(await profile(page)).toEqual(after);
 await page.reload();expect(await profile(page)).toEqual(after);
 await page.locator('#shop-open').click();await page.locator('#shop-owned').click();await expect(page.locator('#shop-items [data-product-id]')).toHaveCount(2);
 await page.locator('[data-product-id="cat"]').click();await expect(page.locator('#shop-action')).toHaveText('장착 중');await expect(page.locator('#shop-preview canvas[data-ready="true"]')).toBeVisible();
});
test('free claim rolls back ownership and equipment if the IndexedDB write fails; concurrent claims stay singular',async({page})=>{
 await page.goto('/');await expect(page.locator('#menu-coins')).toHaveText('0');const before=await profile(page);
 const aborted=await page.evaluate(async()=>{
  const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore(),put=IDBObjectStore.prototype.put;let rejected=false,published=0;s.subscribe(()=>published++);
  IDBObjectStore.prototype.put=function(){throw new DOMException('Quota','QuotaExceededError');};
  try{await s.claimTestMarker();}catch{rejected=true;}finally{IDBObjectStore.prototype.put=put;s.dispose();}
  return{rejected,published};
 });
 expect(aborted).toEqual({rejected:true,published:0});expect(await profile(page)).toEqual(before);
 await Promise.all([store(page,'claimTestMarker'),store(page,'claimTestMarker')]);
 const granted=await profile(page);expect(granted.inventory.ownedMarkerIds).toEqual(['default','cat']);expect(granted.coins).toBe(0);
});
test('all eleven images purchase/equip and restore at mobile size; switching keeps textures bounded and bots unchanged',async({browser})=>{
 test.setTimeout(240000);
 const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/');await expect(page.locator('#menu-coins')).toHaveText('0');
  await page.evaluate(async()=>{const p=await (window as any).__HEXHOLD_TEST__.profile();p.coins=1000;
   await new Promise<void>(resolve=>{const r=indexedDB.open('hexhold.player-profile',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(p,'profile');tx.oncomplete=()=>{db.close();resolve();};};});});
  await page.reload();await expect(page.locator('#menu-coins')).toHaveText('1,000');
  await page.locator('#shop-open').click();await expect(page.locator('#shop-items canvas[data-ready="true"]')).toHaveCount(11);
  await expect(page.locator('[data-product-id="moon"]')).toHaveCount(0);await expect(page.locator('[data-product-id="ghost"]')).toHaveCount(1);
  const ids=await page.locator('#shop-items canvas').evaluateAll(es=>es.map(e=>(e as HTMLElement).dataset.markerId!));
  for(const viewport of [{width:844,height:390},{width:640,height:320},{width:568,height:320}]){
   await page.setViewportSize(viewport);
   for(const id of ['shop-close','shop-preview','shop-action','shop-coins']){
    const b=(await page.locator('#'+id).boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(viewport.width);expect(b.y+b.height).toBeLessThanOrEqual(viewport.height);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);
  }
  await page.setViewportSize({width:844,height:390});await page.screenshot({path:'evidence/marker-v1-shop-landscape.png'});
  for(const id of ids){
   await page.locator('[data-product-id="'+id+'"]').click();await expect(page.locator('#shop-action')).toHaveText('구매 · 50 코인');await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착');await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착 중');
  }
  await page.locator('#shop-colors').click();await page.locator('[data-product-id="violet"]').click();await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착');await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착 중');
  await page.locator('#shop-close').click();await page.reload();await expect(page.locator('#menu-coins')).toHaveText('420');
  const saved=await profile(page);expect(saved.inventory.ownedMarkerIds).toEqual(['default',...ids]);expect(saved.inventory.equippedMarkerId).toBe(ids.at(-1));expect(saved.inventory.equippedMarkerColorId).toBe('violet');
  await page.getByTestId('practice').click();await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().setPaused(true));
  const assets=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerAssets());expect(assets.textureKeys).toHaveLength(22);expect(assets.imageObjects).toBe(24);expect(assets.avatars).toBe(16);
  for(const id of [...ids,...ids]){
   await store(page,'equip','marker',id);await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.local)?.markerId)).toBe(id);
   const states=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState());
   expect(states.find((m:any)=>m.local)).toMatchObject({imageVisible:true,detailVisible:true,imageTint:0xa180f4,detailTint:0xffffff,identificationRing:true,slotColor:0xa180f4});
   expect(states.filter((m:any)=>!m.local).every((m:any)=>m.bodyColor===m.slotColor&&m.identificationRing)).toBe(true);
  }
  expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerAssets())).toEqual(assets);
  await store(page,'equip','marker','cat');await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.local)?.markerId)).toBe('cat');
  await page.screenshot({path:'evidence/marker-v1-cat-gameplay-844x390.png'});
  const measured=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState());expect(measured.zoom).toBeCloseTo(.38,6);
  await page.setViewportSize({width:568,height:320});await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState().zoom)).toBeCloseTo(.35,6);
  await page.screenshot({path:'evidence/marker-v1-cat-gameplay-568x320.png'});await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();expect(errors).toEqual([]);
 }finally{await context.close();}
});
test('exported materials retain grayscale shading, fixed detail colors, transparency and slot-15 ring',async({page})=>{
 await page.goto('/');const checked=await page.evaluate(async()=>{
  const {MARKERS}=await import('/src/client/catalog.ts' as string),{drawTintedBase,imageMarkerPreview}=await import('/src/client/marker-preview-image.ts' as string);
  const results=[];
  for(const d of MARKERS.filter((m:any)=>m.renderType==='IMAGE')){
   const base=new Image(),detail=new Image();base.src='/assets/markers/'+d.id+'-base.png';detail.src='/assets/markers/'+d.id+'-detail.png';await Promise.all([base.decode(),detail.decode()]);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
   ctx.drawImage(base,0,0);const baseData=ctx.getImageData(0,0,256,256).data;let gray=true,shades=new Set<number>(),transparent=0,body=0;
   for(let i=0;i<baseData.length;i+=4){if(!baseData[i+3]){transparent++;continue;}gray&&=baseData[i]===baseData[i+1]&&baseData[i]===baseData[i+2];if(baseData[i+3]>240){body++;shades.add(baseData[i]);}}
   ctx.clearRect(0,0,256,256);ctx.drawImage(detail,0,0);const detailData=ctx.getImageData(0,0,256,256).data;let fixed=0;
   ctx.clearRect(0,0,256,256);drawTintedBase(ctx,base,0xa180f4);ctx.drawImage(detail,0,0);const composed=ctx.getImageData(0,0,256,256).data;
   for(let i=0;i<detailData.length;i+=4)if(detailData[i+3]>240&&baseData[i+3]===0){if(composed[i]!==detailData[i]||composed[i+1]!==detailData[i+1]||composed[i+2]!==detailData[i+2])throw Error('Tint affected fixed detail '+d.id);fixed++;}
   const preview=imageMarkerPreview(d,0xa180f4,0x9b644d);document.body.append(preview);
   await new Promise<void>((resolve,reject)=>{const until=()=>{if(preview.dataset.ready==='true')resolve();else if(preview.dataset.ready==='error')reject(Error('preview'));else requestAnimationFrame(until);};until();});
   const rgba=preview.getContext('2d')!.getImageData(230,128,1,1).data;const ring=Array.from(rgba);preview.remove();
   results.push({id:d.id,gray,shades:shades.size,transparent,body,fixed,ring});
  }return results;
 });
 expect(checked).toHaveLength(11);
 for(const c of checked){expect(c.gray,c.id).toBe(true);expect(c.shades,c.id).toBeGreaterThan(10);expect(c.transparent,c.id).toBeGreaterThan(1000);expect(c.body,c.id).toBeGreaterThan(100);expect(c.fixed,c.id).toBeGreaterThan(100);expect(c.ring.slice(0,3),c.id).toEqual([0x9b,0x64,0x4d]);}
});


test('all-marker gift preserves the real wallet, equips a chosen design in mobile play and survives reload',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const page=await context.newPage();await page.goto('/');await expect(page.locator('#menu-coins')).toHaveText('0');
  const before=await page.evaluate(async()=>{const p=await (window as any).__HEXHOLD_TEST__.profile();p.coins=321;p.stats.totalKills=12;
   p.inventory.ownedMarkerIds.push('cat');p.inventory.equippedMarkerId='cat';p.inventory.ownedMarkerColorIds.push('violet');p.inventory.equippedMarkerColorId='violet';
   p.processedRuns.push({runId:'paid:h:life:1',baseCoins:5,territoryCoins:6,killCoins:3,clearBonusCoins:0,totalCoins:14});p.worlds.push({matchId:'paid',participants:[{participantId:'h',ownerId:'saved',initialTerritoryCells:7,observedLifeId:1,paidLifeId:1,closed:true}]});
   await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('hexhold.player-profile',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(p,'profile');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});return p;
  });
  await page.goto('/?testMarkerGift=all&experimentSeed=4&experimentSlots=16');await expect(page).not.toHaveURL(/testMarkerGift/);await expect(page).toHaveURL(/experimentSeed=4/);
  const after=await profile(page),{inventory,...core}=after,{inventory:oldInventory,...oldCore}=before;expect(core).toEqual(oldCore);expect(inventory.equippedMarkerId).toBe('cat');expect(inventory.equippedMarkerColorId).toBe('violet');expect(inventory.ownedMarkerColorIds).toEqual(oldInventory.ownedMarkerColorIds);expect(new Set(inventory.ownedMarkerIds).size).toBe(15);
  await page.locator('#shop-open').click();await page.locator('#shop-owned').click();await expect(page.locator('#shop-items [data-product-id]')).toHaveCount(15);
  await page.locator('[data-product-id="crown"]').click();await expect(page.locator('#shop-action')).toHaveText('장착');await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착 중');await expect(page.locator('#shop-coins')).toHaveText('321');await page.locator('#shop-close').click();
  await page.goto('/?testMarkerGift=all&experimentSeed=4&experimentSlots=16');await expect(page).not.toHaveURL(/testMarkerGift/);expect((await profile(page)).inventory.equippedMarkerId).toBe('crown');
  await page.getByTestId('practice').click();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.local)?.markerId)).toBe('crown');
  expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.local))).toMatchObject({imageVisible:true,detailVisible:true,markerColorId:'violet',identificationRing:true});
  await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await page.reload();await expect(page.locator('#menu-coins')).toHaveText('321');expect((await profile(page)).inventory.ownedMarkerIds).toEqual(after.inventory.ownedMarkerIds);
 }finally{await context.close();}
});

test('all-marker gift abort never partially unlocks markers; concurrent claims grant once',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),a=new ProfileStore(indexedDB,'all-marker-atomic'),b=new ProfileStore(indexedDB,'all-marker-atomic');
  const before=await a.read(),put=IDBObjectStore.prototype.put;let aborted=false;
  IDBObjectStore.prototype.put=function(...args:any[]){if(this.transaction.db.name==='all-marker-atomic')throw new DOMException('Writes blocked','QuotaExceededError');return put.apply(this,args as any);};
  try{await a.claimTestMarker('all');}catch{aborted=true;}finally{IDBObjectStore.prototype.put=put;}
  const failed=await a.read();await Promise.all([a.claimTestMarker('all'),b.claimTestMarker('all')]);const after=await a.read();a.dispose();b.dispose();return{before,failed,after,aborted};
 });expect(result.aborted).toBe(true);expect(result.failed).toEqual(result.before);expect(result.after.inventory.ownedMarkerIds).toHaveLength(15);expect(new Set(result.after.inventory.ownedMarkerIds).size).toBe(15);expect(result.after.coins).toBe(result.before.coins);
});

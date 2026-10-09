import {createGameServer} from '../../src/server/app.js';
import {until} from '../server/helpers.js';
import {test,expect,type Page} from '@playwright/test';
const DB='hexhold.player-profile';
const legacy=(coins=500)=>({version:1,coins,stats:{runsPlayed:2,classicClears:1,totalKills:12,bestTerritoryPercent:100,longestRunSeconds:95},processedRuns:[{runId:'legacy:h:life:1',baseCoins:5,territoryCoins:200,killCoins:36,clearBonusCoins:100,totalCoins:341}],worlds:[{matchId:'legacy',participants:[{participantId:'h',observedLifeId:1,paidLifeId:1,initialTerritoryCells:7,ownerId:'old',closed:true}]}]});
async function seed(page:Page,value:unknown,name=DB){
  await page.evaluate(async({value,name})=>{
    await new Promise<void>((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('meta'))request.result.createObjectStore('meta');};request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(value,'profile');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};
    });
  },{value,name});
}
async function startFunded(page:Page,coins=500){
  await page.goto('/');await expect(page.locator('#menu-coins')).toHaveText('0');await seed(page,legacy(coins));await page.reload();await expect(page.locator('#menu-coins')).toHaveText(String(coins));
}
async function profile(page:Page){return page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());}
async function corruptWrites(page:Page,on:boolean){
  await page.evaluate(on=>{
    if(on){(window as any).__SHOP_PUT__=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Quota full','QuotaExceededError');};}
    else IDBObjectStore.prototype.put=(window as any).__SHOP_PUT__;
  },on);
}
test('legacy wallet migrates intact; marker and Player Color purchase/equip persist and reserve self color',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
  try{
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await startFunded(page);
    const restored=await profile(page),{inventory,...core}=restored;expect(core).toEqual(legacy());expect(inventory).toMatchObject({ownedMarkerIds:['default'],ownedMarkerColorIds:['slot'],equippedMarkerId:'default',equippedMarkerColorId:'slot'});
    await page.locator('#shop-open').click();await expect(page.locator('#shop-dialog')).toBeVisible();await page.locator('[data-category="BASIC"]').click();await page.locator('[data-product-id="ring"]').click();
    await expect(page.locator('#shop-action')).toHaveText('구매 · 40 코인');await page.locator('#shop-action').click();await expect(page.locator('#shop-coins')).toHaveText('460');await expect(page.locator('#shop-action')).toHaveText('장착');await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착 중');await expect(page.locator('#shop-action')).toBeDisabled();
    for(const viewport of [{width:844,height:390},{width:640,height:320}]){
      await page.setViewportSize(viewport);
      for(const id of ['shop-close','shop-coins','shop-markers','shop-colors','shop-owned','shop-preview','shop-action','shop-status']){
        const b=(await page.locator('#'+id).boundingBox())!;expect(b.x,id).toBeGreaterThanOrEqual(0);expect(b.y,id).toBeGreaterThanOrEqual(0);expect(b.x+b.width,id).toBeLessThanOrEqual(viewport.width);expect(b.y+b.height,id).toBeLessThanOrEqual(viewport.height);
      }
      expect(await page.locator('#shop-dialog').evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);
    }
    await page.screenshot({path:'evidence/shop-v1-basic-landscape.png'});
    await page.locator('#shop-colors').click();await page.locator('[data-product-id="coral"]').click();await expect(page.locator('#shop-item-note')).toContainText('영토 · 꼬리');await page.locator('#shop-action').click();await expect(page.locator('#shop-coins')).toHaveText('430');await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착 중');await page.screenshot({path:'evidence/shop-v1-color-landscape.png'});
    await page.locator('#shop-markers').click();await page.locator('[data-category="CUTE"]').click();await expect(page.locator('.shop-test-label')).toHaveCount(0);await expect(page.locator('#shop-items svg')).toHaveCount(4);await page.locator('[data-product-id="cat"]').click();await expect(page.locator('#shop-item-note')).toContainText('몸통에 내 색상');await page.screenshot({path:'evidence/shop-v1-placeholder-landscape.png'});
    await page.locator('#shop-close').click();await page.reload();await expect(page.locator('#menu-coins')).toHaveText('430');
    const saved=await profile(page);expect(saved.inventory).toMatchObject({ownedMarkerIds:['default','ring'],ownedMarkerColorIds:['slot','coral'],equippedMarkerId:'ring',equippedMarkerColorId:'coral'});expect(saved.stats).toEqual(legacy().stats);expect(saved.processedRuns).toEqual(legacy().processedRuns);expect(saved.worlds).toEqual(legacy().worlds);
    await page.evaluate(async()=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),store=new ProfileStore();try{const r=await store.purchase('marker','ring');if(r.status!=='owned'||r.balance!==430)throw new Error('Duplicate purchase charged');}finally{store.dispose();}});
    await page.getByTestId('practice').click();await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().setPaused(true));
    await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().some((m:any)=>m.local)),{timeout:15000}).toBe(true);
    const markers=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState());expect(markers.find((m:any)=>m.local)).toMatchObject({markerId:'ring',markerColorId:'coral',bodyColor:0xff7084,slotColor:0xff7084,selfBase:true});
    expect(markers.filter((m:any)=>!m.local).every((m:any)=>m.markerColorId==='slot'&&m.bodyColor===m.slotColor&&!m.selfBase)).toBe(true);
    await page.screenshot({path:'evidence/shop-v1-equipped-gameplay.png'});await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();expect(errors).toEqual([]);
  }finally{await context.close();}
});
test('insufficient Coins and failed purchase/equip never apply partial wallet or cosmetic changes',async({page})=>{
  await startFunded(page,100);await page.locator('#shop-open').click();await page.locator('[data-product-id="target"]').click();await expect(page.locator('#shop-action')).toHaveText('구매 · 80 코인');
  await page.locator('[data-product-id="ring"]').click();await profile(page);const before=await profile(page);
  await corruptWrites(page,true);await page.locator('#shop-action').click();await expect(page.locator('#shop-status')).toContainText('저장 실패');await expect(page.locator('#shop-coins')).toHaveText('100');await expect(page.locator('#shop-action')).toHaveText('구매 · 40 코인');await corruptWrites(page,false);expect(await profile(page)).toEqual(before);
  await page.locator('#shop-action').click();await expect(page.locator('#shop-coins')).toHaveText('60');await expect(page.locator('#shop-action')).toHaveText('장착');const bought=await profile(page);
  await corruptWrites(page,true);await page.locator('#shop-action').click();await expect(page.locator('#shop-status')).toContainText('저장 실패');await expect(page.locator('#shop-action')).toHaveText('장착');await corruptWrites(page,false);expect(await profile(page)).toEqual(bought);
  await page.locator('#shop-action').click();await expect(page.locator('#shop-action')).toHaveText('장착 중');await page.locator('[data-product-id="target"]').click();await expect(page.locator('#shop-action')).toHaveText('코인이 부족해요');await expect(page.locator('#shop-action')).toBeDisabled();
  await page.locator('#shop-owned').click();await expect(page.locator('#shop-items [data-product-id]')).toHaveCount(2);await page.locator('#shop-close').click();await page.reload();const saved=await profile(page);expect(saved.coins).toBe(60);expect(saved.inventory.equippedMarkerId).toBe('ring');
});
test('separate tabs serialize the same purchase and preserve simultaneous normal reward updates',async({context})=>{
  const a=await context.newPage(),b=await context.newPage();await Promise.all([a.goto('/'),b.goto('/')]);await seed(a,legacy(50),'shop-race');
  const purchase=async()=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore(indexedDB,'shop-race');try{return await s.purchase('marker','ring');}finally{s.dispose();}};
  const receipts=await Promise.all([a.evaluate(purchase),b.evaluate(purchase)]);expect(receipts.map(r=>r.status).sort()).toEqual(['owned','purchased']);
  const result=await a.evaluate(async()=>{
    const {ProfileStore}=await import('/src/client/profile-store.ts' as string),a=new ProfileStore(indexedDB,'shop-race'),b=new ProfileStore(indexedDB,'shop-race');
    try{const admission={matchId:'new',participantId:'h',lifeId:1,initialTerritoryCells:7,ownerId:'test'};await a.admit(admission);
      const r={runId:'new:h:life:1',matchId:'new',participantId:'h',lifeId:1,endReason:'DEATH',startedAtTick:0,endedAtTick:30,durationTicks:30,simulationHz:30,mapCellCount:9577,kills:1,bestTerritoryCells:7,bestTerritoryPercent:0};
      const outcomes=await Promise.all([a.equip('marker','ring'),b.grant(r),a.purchase('marker-color','coral')]);const p=await a.read();return{p,outcomes};
    }finally{a.dispose();b.dispose();}
  });
  expect(result.p.coins).toBe(18);expect(result.p.inventory.ownedMarkerIds).toEqual(['default','ring']);expect(result.p.inventory.equippedMarkerId).toBe('ring');expect(result.p.inventory.ownedMarkerColorIds).toEqual(['slot']);expect(result.outcomes[2].status).toBe('insufficient');expect(result.p.stats.runsPlayed).toBe(3);
});
test('real saved invalid equipment repairs only that field and never resets wallet or ownership',async({page})=>{
  await startFunded(page,400);const saved={...await profile(page),inventory:{version:1,ownedMarkerIds:['default','hex'],ownedMarkerColorIds:['slot','coral'],equippedMarkerId:'missing',equippedMarkerColorId:'coral'}};
  await seed(page,saved);await page.reload();const fixed=await profile(page);expect(fixed).toEqual({...saved,inventory:{...saved.inventory,equippedMarkerId:'default'}});
  await seed(page,{...fixed,inventory:{...fixed.inventory,equippedMarkerId:'hex',equippedMarkerColorId:'unowned'}});await page.reload();const next=await profile(page);expect(next).toEqual({...fixed,inventory:{...fixed.inventory,equippedMarkerId:'hex',equippedMarkerColorId:'slot'}});
});
test('unavailable storage disables Shop actions and recovers when storage access returns',async({page})=>{
  await page.addInitScript(()=>{(window as any).__SHOP_DB__=indexedDB;Object.defineProperty(window,'indexedDB',{get(){throw new Error('blocked');}});});
  await page.goto('/');await page.locator('#shop-open').click();await expect(page.locator('#shop-status')).toContainText('저장소를 읽지 못');await expect(page.locator('#shop-action')).toBeDisabled();await expect(page.locator('#shop-reload')).toBeVisible();
  await page.evaluate(()=>Object.defineProperty(window,'indexedDB',{value:(window as any).__SHOP_DB__}));await page.locator('#shop-reload').click();await expect(page.locator('#shop-coins')).toHaveText('0');await expect(page.locator('#shop-reload')).toBeHidden();await page.locator('#shop-close').click();await page.getByTestId('practice').click();if(await page.locator('#tutorial').isVisible())await page.getByTestId('tutorial-skip').click();await expect(page.locator('#hud')).toBeVisible();
});

test('migration write failure preserves the complete legacy record until a successful retry',async({page})=>{
  await page.goto('/');const original=legacy(777);await seed(page,original,'shop-migration-abort');
  const result=await page.evaluate(async()=>{
    const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore(indexedDB,'shop-migration-abort'),put=IDBObjectStore.prototype.put;
    let aborted=false;IDBObjectStore.prototype.put=function(){if(this.transaction.db.name==='shop-migration-abort')throw new DOMException('Quota full','QuotaExceededError');return put.apply(this,arguments as any);};
    try{await s.read();}catch{aborted=true;}finally{IDBObjectStore.prototype.put=put;s.dispose();}
    const raw=await new Promise<any>((resolve,reject)=>{const req=indexedDB.open('shop-migration-abort',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('meta','readonly'),get=tx.objectStore('meta').get('profile');get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>db.close();tx.onabort=()=>reject(tx.error);};});
    const retry=new ProfileStore(indexedDB,'shop-migration-abort');try{return{aborted,raw,recovered:await retry.read()};}finally{retry.dispose();}
  });
  expect(result.aborted).toBe(true);expect(result.raw).toEqual(original);const {inventory,...core}=result.recovered;expect(core).toEqual(original);expect(inventory.equippedMarkerId).toBe('default');
});
test('online equipment remains local and never changes the other client or match data',async({browser})=>{
  process.env.NODE_ENV='test';let now=0;const server=createGameServer({autoStart:false,now:()=>now,seed:()=>4});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
  const a=await browser.newContext({viewport:{width:844,height:390}}),b=await browser.newContext({viewport:{width:844,height:390}});
  await Promise.all([a.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1')),b.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'))]);
  try{
    const pa=await a.newPage(),pb=await b.newPage();await startFunded(pa);await pb.goto('/');
    await pa.evaluate(async()=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore();try{await s.purchase('marker','ring');await s.purchase('marker-color','coral');await s.equip('marker','ring');await s.equip('marker-color','coral');}finally{s.dispose();}});
    await expect(pa.locator('#menu-coins')).toHaveText('430');await pa.getByTestId('create').click();await expect(pa.locator('#friend-code')).not.toHaveText('',{timeout:15000});const code=await pa.locator('#friend-code').textContent();
    await pb.getByTestId('room-code').fill(code!);await pb.getByTestId('join').click();await expect(pb.locator('#room-panel')).toBeVisible({timeout:15000});await pa.getByTestId('start').click();await until(()=>[...server.rooms.rooms.values()][0]?.phase==='COUNTDOWN');now=3000;server.loop.pump();await Promise.all([expect(pa.locator('#hud')).toBeVisible(),expect(pb.locator('#hud')).toBeVisible()]);
    const av=await pa.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState()),bv=await pb.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState());
    const self=av.find((m:any)=>m.local);expect(self).toMatchObject({markerId:'ring',markerColorId:'coral',bodyColor:0xff7084,selfBase:true});
    const observed=await pb.evaluate(id=>{const t=(window as any).__HEXHOLD_TEST__,slot=t.getView().participants.find((p:any)=>p.participantId===id).slot;return t.getPlayerColors()[slot];},self.participantId);const seen=bv.find((m:any)=>m.participantId===self.participantId);expect(seen).toMatchObject({markerId:'default',markerColorId:'slot',local:false,bodyColor:observed,selfBase:false});expect(observed).not.toBe(self.bodyColor);
    expect(bv.find((m:any)=>m.local).markerId).toBe('default');
    const room=[...server.rooms.rooms.values()][0];expect(room.match!.participants.every(p=>!('inventory'in p)&&!('equippedMarkerId'in p))).toBe(true);
    await pa.screenshot({path:'evidence/shop-v1-local-only-online.png'});
  }finally{await Promise.all([a.close(),b.close()]);await server.close();}
});

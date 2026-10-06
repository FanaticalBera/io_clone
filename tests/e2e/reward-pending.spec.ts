import {test,expect} from '@playwright/test';
test('committed reward resolves despite listener and cross-tab notification exceptions; dedup and next save still work',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore(indexedDB,'reward-notifications');
  const admission={matchId:'notify',participantId:'h',lifeId:1,initialTerritoryCells:7,ownerId:'tab'};
  const run={runId:'notify:h:life:1',matchId:'notify',participantId:'h',lifeId:1,endReason:'DEATH',startedAtTick:0,endedAtTick:30,durationTicks:30,simulationHz:30,mapCellCount:1000,kills:3,bestTerritoryCells:1,bestTerritoryPercent:.1};
  await s.admit(admission);let notified=0;s.subscribe(()=>{throw Error('Presentation callback failed');});s.subscribe(()=>notified++);
  const post=BroadcastChannel.prototype.postMessage;BroadcastChannel.prototype.postMessage=function(message){if(this.name==='reward-notifications')throw new DOMException('Notify blocked','InvalidStateError');return post.call(this,message);};
  try{
   const grant=await s.grant(run),duplicate=await s.grant(run);await s.admit({...admission,lifeId:2});
   const next=await s.grant({...run,lifeId:2,runId:'notify:h:life:2'});return{grant,duplicate,next,profile:await s.read(),notified};
  }finally{BroadcastChannel.prototype.postMessage=post;s.dispose();}
 });
 expect(result.grant).toMatchObject({status:'granted',balance:14});expect(result.duplicate.status).toBe('duplicate');expect(result.next).toMatchObject({status:'granted',balance:28});
 expect(result.profile.coins).toBe(28);expect(result.profile.stats.runsPlayed).toBe(2);expect(result.profile.processedRuns).toHaveLength(2);expect(result.notified).toBe(4);
});
test('stalled IndexedDB transaction aborts rather than hanging forever; profile remains intact and retry grants once',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {ProfileStore,PROFILE_TRANSACTION_TIMEOUT_MS}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore(indexedDB,'reward-stalled');
  const admission={matchId:'stall',participantId:'h',lifeId:1,initialTerritoryCells:7,ownerId:'tab'};
  const run={runId:'stall:h:life:1',matchId:'stall',participantId:'h',lifeId:1,endReason:'DEATH',startedAtTick:0,endedAtTick:30,durationTicks:30,simulationHz:30,mapCellCount:1000,kills:3,bestTerritoryCells:1,bestTerritoryPercent:.1};
  await s.admit(admission);const before=await s.read(),get=IDBObjectStore.prototype.get,timer=window.setTimeout;let aborted='',published=0;s.subscribe(()=>published++);
  // Keep a real transaction alive while withholding its profile request event.
  // Accelerate only the production deadline, leaving browser event semantics intact.
  window.setTimeout=((handler:any,delay?:number,...args:any[])=>timer(handler,delay===PROFILE_TRANSACTION_TIMEOUT_MS?100:delay,...args)) as typeof window.setTimeout;
  IDBObjectStore.prototype.get=function(key){
   const request=get.call(this,key);
   if(this.transaction.db.name==='reward-stalled'&&key==='profile'){
    const store=this;Object.defineProperty(request,'onsuccess',{set(){
     request.addEventListener('success',()=>{
      const keepAlive=()=>{try{const pending=get.call(store,'keep-alive');pending.onsuccess=keepAlive;}catch{}};
      keepAlive();
     });
    }});
   }
   return request;
  };
  try{await s.grant(run);}catch(e){aborted=(e as Error).message;}finally{IDBObjectStore.prototype.get=get;window.setTimeout=timer;}
  const after=await s.read(),beforeRetryNotifications=published,retry=await s.grant(run),duplicate=await s.grant(run),saved=await s.read();s.dispose();
  return{aborted,before,after,beforeRetryNotifications,retry,duplicate,saved};
 });
 expect(result.aborted).toContain('timed out');expect(result.after).toEqual(result.before);expect(result.beforeRetryNotifications).toBe(0);
 expect(result.retry).toMatchObject({status:'granted',balance:14});expect(result.duplicate.status).toBe('duplicate');expect(result.saved.stats.runsPlayed).toBe(1);
});
test('mobile death displays earned and zero Coins after retry with local image marker equipped',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?testMarkerGift=cat&experimentSeed=4');await expect(page).not.toHaveURL(/testMarkerGift/);
  await page.getByTestId('practice').click();
  await page.evaluate(async()=>{const t=(window as any).__HEXHOLD_TEST__,s=t.getPractice();s.setPaused(true);s.match.participants[0].kills=3;const {markDead}=await import('/src/shared/life.ts' as string);markDead(s.match,s.match.participants[0],'WALL_HIT');t.showPracticeView();});
  await expect(page.locator('#run-results')).toBeVisible();await expect(page.locator('#run-coins')).toHaveText('+14 Coins');await expect(page.locator('#run-balance')).toHaveText('보유 14 Coins');
  await page.locator('#run-retry').click();
  await page.evaluate(async()=>{const t=(window as any).__HEXHOLD_TEST__,s=t.getPractice();s.setPaused(true);const {markDead}=await import('/src/shared/life.ts' as string);markDead(s.match,s.match.participants[0],'WALL_HIT');t.showPracticeView();});
  await expect(page.locator('#run-coins')).toHaveText('+0 Coins');await expect(page.locator('#run-balance')).toHaveText('보유 14 Coins');
  await page.screenshot({path:'evidence/reward-pending-mobile-zero.png'});
  await page.locator('#run-menu').click();await expect(page.locator('#menu-coins')).toHaveText('Coins · 14');await page.reload();await expect(page.locator('#menu-coins')).toHaveText('Coins · 14');expect(errors).toEqual([]);
 }finally{await context.close();}
});


test('opt-in app diagnostics reports transaction and UI completion; ordinary game has no panel',async({page})=>{
 await page.setViewportSize({width:844,height:390});await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debugProfile=1');await expect(page.locator('#menu-coins')).toHaveText('Coins · 0');
 await expect(page.locator('#profile-diagnostics pre')).toContainText('TX_COMMIT read');await expect(page.locator('#profile-diagnostics pre')).toContainText('UI_PROFILE_OK');
 await expect(page.locator('#profile-diagnostics-copy')).toBeVisible();await page.locator('#profile-diagnostics-toggle').click();await expect(page.locator('#profile-diagnostics pre')).toBeHidden();await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();await page.locator('#profile-diagnostics-toggle').click();await expect(page.locator('#profile-diagnostics pre')).toBeVisible();await page.goto('/');await expect(page.locator('#menu-coins')).toHaveText('Coins · 0');await expect(page.locator('#profile-diagnostics')).toHaveCount(0);
});

test('profile presentation failure after balance update does not mislabel a readable wallet as storage unavailable',async({page})=>{
 await page.addInitScript(()=>{const clone=window.structuredClone;window.structuredClone=function<T>(value:T,options?:StructuredSerializeOptions):T{
  if(new Error().stack?.includes('ShopUI.setProfile'))throw Error('Injected shop presentation error');return clone(value,options);
 };});
 await page.goto('/?debugProfile=1');await expect(page.locator('#menu-coins')).toHaveText('Coins · 0');
 await expect(page.locator('#profile-diagnostics pre')).toContainText('INITIAL_PRESENTATION_ERROR · Error: Injected shop presentation error');
 await expect(page.locator('#profile-diagnostics pre')).not.toContainText('INITIAL_STORAGE_ERROR');
 const profile=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());expect(profile.coins).toBe(0);expect(profile.processedRuns).toEqual([]);
});


test('valid profile reads use readonly transactions without put; diagnostic write probe leaves the wallet unchanged',async({page})=>{
 await page.goto('/?debugProfile=1');await expect(page.locator('#menu-coins')).toHaveText('Coins · 0');
 const result=await page.evaluate(async()=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore(indexedDB,'readonly-profile');
  const original=await s.read(),transaction=IDBDatabase.prototype.transaction,put=IDBObjectStore.prototype.put,modes:string[]=[];let writes=0;
  IDBDatabase.prototype.transaction=function(...args:any[]){if(this.name==='readonly-profile')modes.push(args[1]??'readonly');return transaction.apply(this,args as any);};
  IDBObjectStore.prototype.put=function(...args:any[]){if(this.transaction.db.name==='readonly-profile')writes++;return put.apply(this,args as any);};
  try{return{original,restored:await s.read(),modes,writes};}finally{IDBDatabase.prototype.transaction=transaction;IDBObjectStore.prototype.put=put;s.dispose();}
 });
 expect(result.restored).toEqual(result.original);expect(result.modes).toEqual(['readonly']);expect(result.writes).toBe(0);
 const before=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());await page.locator('#profile-diagnostics-write').click();
 await expect(page.locator('#profile-diagnostics pre')).toContainText('WRITE_PROBE_OK (intentionally aborted, no writes)');
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile())).toEqual(before);
});


test('reopening an already granted and equipped cat link needs no write and preserves wallet and reward ledgers',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore(indexedDB,'repeat-marker-gift');
  const before=await s.claimTestMarker(),put=IDBObjectStore.prototype.put;let notified=0;s.subscribe(()=>notified++);
  IDBObjectStore.prototype.put=function(...args:any[]){if(this.transaction.db.name==='repeat-marker-gift')throw new DOMException('Writes blocked','QuotaExceededError');return put.apply(this,args as any);};
  try{return{before,after:await s.claimTestMarker(),notified};}finally{IDBObjectStore.prototype.put=put;s.dispose();}
 });expect(result.after).toEqual(result.before);expect(result.notified).toBe(0);expect(result.after.inventory.ownedMarkerIds).toEqual(['default','cat']);
});

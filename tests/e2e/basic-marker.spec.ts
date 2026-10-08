import {createGameServer} from '../../src/server/app.js';
import {emptyProfile} from '../../src/client/profile.js';
import {test,expect,type Page} from '@playwright/test';
async function equip(page:Page,id:string){await page.locator('#shop-open').click();await page.locator('[data-product-id="'+id+'"]').click();const action=page.locator('#shop-action');if(await action.textContent()!=='장착 중')await action.click();await expect(action).toHaveText('장착 중');}
for(const query of ['', '&experimentBasicContrast=0'])test('approved Basic markers are the default with query '+(query||'none')+' inside own territory',async({browser})=>{
 test.setTimeout(180000);const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/?testMarkerGift=all&experimentSeed=4'+query);await expect(page).not.toHaveURL(/testMarkerGift/);await expect(page.locator('#menu-coins')).toHaveText('0');await page.getByRole('button',{name:'안내 닫기'}).click();
  const before=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());
  for(const id of ['ring','target']){
   await equip(page,id);const primitives=page.locator('#shop-preview svg > circle, #shop-preview svg > line');await expect(primitives).toHaveCount(id==='ring'?4:19);await page.locator('#shop-close').click();
   await page.locator('#profile-open').click();await expect(page.locator('#profile-preview svg > circle, #profile-preview svg > line')).toHaveCount(id==='ring'?4:19);await page.locator('#profile-close').click();
   await page.getByTestId('nickname').fill('브로');await page.getByTestId('practice').click();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice()!=null)).toBe(true);await page.evaluate(()=>{const t=(window as any).__HEXHOLD_TEST__,s=t.getPractice();s.setPaused(true);const m=s.match,p=m.participants[0],id=([...p.spawnCells].find((id:any)=>m.owners[id]===p.slot+1&&m.map.cells[id].neighbors.filter((n:number)=>n>=0&&m.owners[n]===p.slot+1).length===6)??[...p.spawnCells].find((id:any)=>m.owners[id]===p.slot+1)) as number;p.cellId=id;p.position={...m.map.cells[id].center};p.protectedUntilTick=0;t.showPracticeView();t.getScene().freezePresentation();});
   await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.local)?.markerId),{timeout:15000}).toBe(id);
   const state=await page.evaluate(()=>{const t=(window as any).__HEXHOLD_TEST__,s=t.getScene(),p=t.getPractice().match.participants[0];return {marker:t.getMarkerState().find((m:any)=>m.local),owners:[...t.getPractice().match.owners],ownCell:t.getPractice().match.owners[p.cellId],slot:p.slot,resources:t.getMarkerAssets(),label:s.avatars.get(s.selfId).label.text};});
   expect(state.marker).toMatchObject({imageVisible:false,bodyColor:0x16cdb1,identificationRadius:25.5});expect(state.ownCell).toBe(state.slot+1);expect(state.resources.avatars).toBe(16);expect(state.label).toBe('브로');
   for(const viewport of [{width:844,height:390},{width:640,height:320},{width:568,height:320}]){
    await page.setViewportSize(viewport);await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState().viewport.width)).toBe(viewport.width);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);
    await page.screenshot({path:'evidence/basic-contrast-'+'approved'+'-'+id+'-'+viewport.width+'x'+viewport.height+'.png'});
   }
   await page.evaluate(()=>{const t=(window as any).__HEXHOLD_TEST__,s=t.getScene(),m=t.getPractice().match,before={tick:m.tick,owners:[...m.owners],participants:m.participants.map((p:any)=>[p.participantId,p.slot,p.position.x,p.position.y])};s.setMarkerAppearance({...s.markerAppearance});if(JSON.stringify(before)!==JSON.stringify({tick:m.tick,owners:[...m.owners],participants:m.participants.map((p:any)=>[p.participantId,p.slot,p.position.x,p.position.y])}))throw Error('Marker redraw changed gameplay');});
   await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await page.setViewportSize({width:844,height:390});
  }
  const after=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());expect(after.coins).toBe(before.coins);expect(after.stats).toEqual(before.stats);expect(after.processedRuns).toEqual(before.processedRuns);expect(after.inventory.ownedMarkerIds).toEqual(before.inventory.ownedMarkerIds);expect(after.inventory.equippedMarkerId).toBe('target');
  await page.reload();await expect(page.locator('#menu-coins')).toHaveText('0');await equip(page,'target');await expect(page.locator('#shop-preview svg > circle, #shop-preview svg > line')).toHaveCount(19);expect(errors).toEqual([]);
 }finally{await context.close();}
});


test('production uses approved Ring and Target without a trial option',async({browser})=>{
 const server=createGameServer({autoStart:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const port=(server.http.address() as {port:number}).port,context=await browser.newContext({viewport:{width:568,height:320},isMobile:true,hasTouch:true});
 try{const page=await context.newPage();await page.goto('http://127.0.0.1:'+port+'/');await expect(page.locator('#menu-coins')).toHaveText('0');
  const p=emptyProfile();p.inventory.ownedMarkerIds.push('ring','target');p.inventory.equippedMarkerId='ring';
  await page.evaluate(p=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('hexhold.player-profile',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(p,'profile');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};r.onerror=()=>reject(r.error);}),p);
  await page.reload();await expect(page.locator('#menu-coins')).toHaveText('0');
  for(const id of ['ring','target']){await equip(page,id);await expect(page.locator('#shop-preview svg > circle, #shop-preview svg > line')).toHaveCount(id==='ring'?4:19);await page.locator('#shop-close').click();}
  expect(await page.evaluate(()=>('__HEXHOLD_TEST__'in window))).toBe(false);
 }finally{await context.close();await server.close();}
});




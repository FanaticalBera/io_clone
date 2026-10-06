import {test,expect} from '@playwright/test';
for(const width of [844,568])test('fixed 48 image markers and chosen nickname at '+width+' CSS pixels keeps rings, bots, zoom and inventory intact',async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:width===844?390:320},deviceScaleFactor:3,isMobile:true,hasTouch:true});await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const query of ['', '&experimentMarkerSize=42','&experimentMarkerSize=48']){
   const diameter=48;
   await page.goto('/?testMarkerGift=all&experimentSeed=4'+query);await expect(page).not.toHaveURL(/testMarkerGift/);
   await page.evaluate(async()=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore();try{await s.equip('marker','cat');}finally{s.dispose();}});
   await page.getByTestId('nickname').fill('브로 테스트');
   await page.getByTestId('practice').click();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice()!=null)).toBe(true);await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().setPaused(true));
   await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.local)?.imageDiameter)).toBe(diameter);
   expect(await page.evaluate(()=>{const t=(window as any).__HEXHOLD_TEST__,s=t.getScene();return {name:t.getView().participants.find((p:any)=>p.participantId===s.selfId).nickname,label:s.avatars.get(s.selfId).label.text};})).toEqual({name:'브로 테스트',label:'브로 테스트'});
   const state=await page.evaluate(()=>{const t=(window as any).__HEXHOLD_TEST__;return{markers:t.getMarkerState(),render:t.getRenderState(),assets:t.getMarkerAssets()};});
   expect(state.markers.find((m:any)=>m.local)).toMatchObject({imageDiameter:diameter,detailDiameter:diameter,identificationRadius:25.5,identificationRing:true});
   expect(state.markers.filter((m:any)=>!m.local).every((m:any)=>m.bodyColor===m.slotColor&&(!m.imageVisible||m.imageDiameter===48))).toBe(true);
   expect(state.render.zoom).toBeCloseTo(width<600?.35:.38,6);expect(state.assets.textureKeys).toHaveLength(22);expect(state.assets.imageObjects).toBe(24);expect(state.assets.avatars).toBe(16);
   await page.screenshot({path:'.local/marker-size-fixed-'+width+'x'+(width===844?390:320)+'.png'});
   await page.getByTestId('leave').click();await expect(page.locator('#menu-coins')).toHaveText('Coins · 0');
   const saved=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.profile());expect(saved.inventory.ownedMarkerIds).toHaveLength(15);expect(saved.inventory.equippedMarkerId).toBe('cat');
  }
  await page.evaluate(async()=>{const {ProfileStore}=await import('/src/client/profile-store.ts' as string),s=new ProfileStore();try{await s.equip('marker','hex');}finally{s.dispose();}});
  await page.getByTestId('practice').click();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.local)?.markerId)).toBe('hex');
  expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getMarkerState().find((m:any)=>m.local))).toMatchObject({imageVisible:false,imageDiameter:null,identificationRadius:25.5});expect(errors).toEqual([]);
 }finally{await context.close();}
});

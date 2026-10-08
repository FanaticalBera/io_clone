import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test('dense displays gain backing pixels while preserving field size, aiming and combat placement',async({browser})=>{
 const evidence:any[]=[];
 for(const density of [1,2,2.625,3]){
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:density,isMobile:true,hasTouch:true});
  try{
   const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('http://127.0.0.1:5173/tests/fixtures/combat.html');
   await page.waitForFunction(()=>!!(window as any).fixture?.scene.combatState());
   for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.renderState().viewport)).toEqual(viewport);
    await page.evaluate(()=>new Promise<void>(resolve=>(window as any).fixture.scene.game.events.once('postrender',()=>resolve())));
    const state=await page.evaluate(()=>{
     const scene=(window as any).fixture.scene,state=scene.renderState(),camera=scene.cameras.main;
     const {width,height}=state.viewport;
     const direction=scene.pointerDirection(width/2+80,height/2);
     const worldWidth=camera.getWorldPoint(scene.scale.width,scene.scale.height/2).x-camera.getWorldPoint(0,scene.scale.height/2).x;
     const labels=scene.children.list.filter((child:any)=>child.type==='Container').flatMap((child:any)=>child.list.filter((c:any)=>c.type==='Text'));
     return {...state,direction,worldWidth,deadZone:scene.pointerDirection(width/2+17,height/2),outsideDeadZone:scene.pointerDirection(width/2+19,height/2),textResolutions:labels.map((label:any)=>label.style.resolution)};
    });
    expect(state.backing).toEqual({width:Math.round(viewport.width*density),height:Math.round(viewport.height*density)});
    expect(state.zoom).toBeCloseTo(viewport.width<600?.35:.38);
    // Integer backing pixels and Phaser's Float32 matrices permit sub-pixel rounding.
    expect(Math.abs(state.worldWidth-viewport.width/state.zoom)).toBeLessThan(1);
    expect(state.centerError).toBeLessThan(.01);expect(state.direction.x).toBeGreaterThan(0);expect(Math.abs(state.direction.y)).toBeLessThan(.01);
    expect(state.deadZone).toBeNull();expect(state.outsideDeadZone).not.toBeNull();
    expect(state.textResolutions).toEqual([density,density]);evidence.push({density,...state});
   }
   if(density===1||density===3)await page.screenshot({path:density===1?'evidence/mobile-resolution-before.png':'evidence/mobile-resolution-after.png'});
   await page.evaluate(()=>(window as any).fixture.kill());
   await page.evaluate(()=>(window as any).fixture.freezeImpact());
   const message=await page.evaluate(()=>{
    const scene=(window as any).fixture.scene,message=scene.children.list.find((child:any)=>child.type==='Text'&&child.depth===11),camera=scene.cameras.main;
    const position=camera.matrix.transformPoint(message.x,message.y),ratio=scene.renderState().pixelRatio;
    return{x:position.x/ratio,y:position.y/ratio,fontSize:message.style.fontSize,resolution:message.style.resolution,visible:message.visible};
   });
   expect(message.visible).toBe(true);expect(message.resolution).toBe(density);
   expect(Math.abs(message.x-422)).toBeLessThan(.5);expect(Math.abs(message.y-(195+(390*.31-195)*.38))).toBeLessThan(.5);
   expect(message.fontSize).toBe('32px');
   expect(errors).toEqual([]);
  }finally{await context.close();}
 }
 await writeFile('evidence/mobile-resolution.json',JSON.stringify({condition:'Automated Chromium, not physical-device performance acceptance',samples:evidence},null,2));
});

test('high-density mobile touch and minimap remain usable after rotation',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{localStorage.setItem('hexhold.tutorialSeen','1');localStorage.setItem('hexhold.settings',JSON.stringify({mobileControls:'drag',killVibration:false}));});
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();
  const cdp=await context.newCDPSession(page);
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){
   await page.setViewportSize(viewport);
   await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState().viewport)).toEqual(viewport);
   const {width,height}=viewport;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width*.6,y:height*.6,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width*.6,y:height*.6-50,id:1}]});
   await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection())).toEqual({x:0,y:-1});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   
   await expect(page.locator('#minimap')).toBeVisible();
   await expect.poll(()=>page.locator('#minimap').evaluate((canvas:HTMLCanvasElement)=>({width:canvas.width,height:canvas.height}))).toEqual({width:426,height:360});
   await page.keyboard.press('Escape');
  }
  // Moving between displays can change DPR without changing the CSS viewport.
  await page.evaluate(()=>{Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:2});window.dispatchEvent(new Event('resize'));});
  await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState().backing)).toEqual({width:780,height:1688});
 }finally{await context.close();}
});

test('extreme display densities cap rendering work',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:4});
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');
  await page.waitForFunction(()=>!!(window as any).__HEXHOLD_TEST__);
  const state=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState());
  expect(state.pixelRatio).toBeGreaterThan(1);expect(state.pixelRatio).toBeLessThan(3);
  expect(state.backing.width*state.backing.height).toBeLessThan(4_005_000);
 }finally{await context.close();}
});

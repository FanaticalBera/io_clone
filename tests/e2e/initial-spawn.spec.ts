import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createMap,scaledStartAnchors,axialToWorld} from '../../src/shared/hex.js';

for(const device of [{name:'desktop',width:1280,height:800,touch:false},{name:'landscape',width:844,height:390,touch:true}])test(`${device.name}: R32/R36/R40 scaled placement camera and full-map minimap`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:device.width,height:device.height},hasTouch:device.touch}),page=await context.newPage(),errors:string[]=[],records:any[]=[];
 page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{for(const radius of [32,36,40]){
  await page.goto(`http://127.0.0.1:5174/?experimentMapRadius=${radius}&experimentSeed=4`);await page.getByTestId('nickname').fill('시작 배치');await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#minimap')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState().centerError)).toBeLessThan(.01);
  const measured=await page.evaluate(()=>{const api=(window as any).__HEXHOLD_TEST__,view=api.getView(),render=api.getRenderState(),field=document.querySelector('#field canvas')!.getBoundingClientRect(),mini=document.querySelector<HTMLCanvasElement>('#minimap')!,rect=mini.getBoundingClientRect();return {radius:view.config.mapRadius,totalCells:view.owners.length,participants:view.participants.length,render,viewport:{width:field.width,height:field.height},minimap:{width:rect.width,height:rect.height,canvasWidth:mini.width,canvasHeight:mini.height},tick:view.tick,participantPositions:view.participants.map((p:any)=>({slot:p.slot,x:p.position.x,y:p.position.y})),canvasMaxTextureSize:(document.querySelector<HTMLCanvasElement>('#field canvas')!.getContext('webgl') as WebGLRenderingContext|null)?.getParameter(0x0D33)??null};});
  expect(measured.radius).toBe(radius);expect(measured.totalCells).toBe(1+3*radius*(radius+1));expect(measured.participants).toBe(8);expect(measured.render.zoom).toBe(.38);expect(measured.minimap.width).toBe(144);expect(measured.minimap.height).toBe(122);
  const map=createMap(radius),scale=Math.min((measured.minimap.canvasWidth-20)/(Math.sqrt(3)*map.side*(2*radius+1)),(measured.minimap.canvasHeight-20)/(map.side*(3*radius+2))),all=map.cells.flatMap(c=>c.vertices);
  const bounds={minX:Math.min(...all.map(p=>p.x)),maxX:Math.max(...all.map(p=>p.x)),minY:Math.min(...all.map(p=>p.y)),maxY:Math.max(...all.map(p=>p.y))};
  expect(measured.minimap.canvasWidth/2+bounds.minX*scale).toBeGreaterThan(0);expect(measured.minimap.canvasWidth/2+bounds.maxX*scale).toBeLessThan(measured.minimap.canvasWidth);expect(measured.minimap.canvasHeight/2+bounds.minY*scale).toBeGreaterThan(0);expect(measured.minimap.canvasHeight/2+bounds.maxY*scale).toBeLessThan(measured.minimap.canvasHeight);
  const textureWidth=Math.ceil(bounds.maxX)-Math.floor(bounds.minX)+6,textureHeight=Math.ceil(bounds.maxY)-Math.floor(bounds.minY)+6;
  if(measured.canvasMaxTextureSize!==null){expect(textureWidth).toBeLessThanOrEqual(measured.canvasMaxTextureSize);expect(textureHeight).toBeLessThanOrEqual(measured.canvasMaxTextureSize);}
  const coordinates=scaledStartAnchors(radius).map(p=>axialToWorld(p.q,p.r));
  // Observe early real movement, without injecting ownership or player state.
  if(measured.tick<30)for(const p of measured.participantPositions)expect(Math.min(...coordinates.map(a=>Math.hypot(a.x-p.x,a.y-p.y)))).toBeLessThan(240);
  records.push({...measured,bounds,groundTexture:{width:textureWidth,height:textureHeight},worldView:{width:measured.viewport.width/measured.render.zoom,height:measured.viewport.height/measured.render.zoom},minimapHexNeighborCssPixels:Math.sqrt(3)*map.side*scale*measured.minimap.width/measured.minimap.canvasWidth});
  await page.screenshot({path:`evidence/initial-spawn/${device.name}-R${radius}.png`});
 }
 expect(errors).toEqual([]);mkdirSync('evidence/initial-spawn',{recursive:true});writeFileSync(`evidence/initial-spawn/${device.name}-view.json`,JSON.stringify({note:'Automated Chromium render and geometry inspection; not physical-device performance or human balance acceptance',records,errors},null,2));
 }finally{await context.close();}
});

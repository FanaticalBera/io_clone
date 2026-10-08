import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {writeFile} from 'node:fs/promises';
import {moveSpeed} from '../../src/shared/config.js';
test('PC constant movement keeps camera continuous in practice and online',async({browser})=>{
 const server=createGameServer({config:{countdownSeconds:0.03},seed:()=>4});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const context=await browser.newContext({viewport:{width:1280,height:800}});await context.addInitScript(()=>{
  localStorage.setItem('hexhold.tutorialSeen','1');
  // Only fix the practice match seed. Network request IDs retain real randomness.
  const random=crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues=(array)=>{if(array instanceof Uint32Array&&array.length===1){array[0]=4;return array;}return random(array);};
 });
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');const evidence:any[]=[];
  for(const mode of ['practice','online']){
   if(mode==='practice')await page.getByTestId('practice').click();
   else{await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();}
   await expect(page.locator('#hud')).toBeVisible();expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().seed)).toBe(4);const startPosition=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().participants.find((p:any)=>p.kind==='HUMAN').position);
   const key=Math.abs(startPosition.x)>Math.abs(startPosition.y)?(startPosition.x>0?'a':'d'):(startPosition.y>0?'w':'s');
   await page.keyboard.press(key);await page.waitForTimeout(500);
   const pointerFrames=await page.evaluate(()=>{
    const api=(window as any).__HEXHOLD_TEST__,normal=api.pointerDirection(720,400),own=Object.getOwnPropertyDescriptor(performance,'now'),clock=performance.now.bind(performance);
    try{Object.defineProperty(performance,'now',{configurable:true,value:()=>clock()+250});return{normal,betweenFrames:api.pointerDirection(720,400)};}
    finally{if(own)Object.defineProperty(performance,'now',own);else delete (performance as any).now;}
   });
   expect(pointerFrames.betweenFrames,mode+' control centre must stay on the rendered avatar between frames').toEqual(pointerFrames.normal);
   const samples=await page.evaluate(()=>new Promise<{at:number;camera:{x:number;y:number};tick:number;lifeId:number|null;centerError:number;lifeState:string|null}[]>(resolve=>{
     // Measure displacement against the time that produced the rendered positions.
     // rAF's scheduled timestamp can precede Phaser's performance.now() under load.
     const samples:any[]=[];let start=0;const frame=(at:number)=>{if(!start)start=at;const state=(window as any).__HEXHOLD_TEST__.getRenderState();samples.push({...state,at:state.renderedAt});if(at-start>=1200)resolve(samples);else requestAnimationFrame(frame);};requestAnimationFrame(frame);
   }));
   expect(new Set(samples.map(s=>s.tick)).size).toBeGreaterThanOrEqual(8);
   const config=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().config),speed=moveSpeed(config);
   expect(config.moveCellsPerSecond).toBe(4.2);
   // Local practice publishes discrete 30Hz positions; permit one fixed-step quantization error.
   const tolerance=mode==='practice'?speed/config.simulationHz:8;
   const jumps=samples.slice(1).flatMap((s,i)=>s.lifeId===samples[i].lifeId&&s.lifeState==='ALIVE'&&samples[i].lifeState==='ALIVE'?[Math.hypot(s.camera.x-samples[i].camera.x,s.camera.y-samples[i].camera.y)-(speed*(s.at-samples[i].at)/1000+tolerance)]:[]);
   expect(Math.max(...samples.map(s=>s.centerError))).toBeLessThan(0.01);
   expect(jumps.length).toBeGreaterThan(10);expect(Math.max(...jumps),mode).toBeLessThanOrEqual(0);
   const first=samples[0],last=samples.at(-1)!;
   expect(Math.hypot(last.camera.x-first.camera.x,last.camera.y-first.camera.y)).toBeGreaterThan(50);
   evidence.push({mode,frames:samples.length,sampleMs:last.at-first.at,maxCenterError:Math.max(...samples.map(s=>s.centerError)),maxExcessMovement:Math.max(...jumps),condition:'Actual Phaser camera sampled in automated headless Chromium; continuity proof, not physical GPU FPS acceptance'});
   await page.screenshot({path:'evidence/T38-PC-'+mode+'-camera.png'});
   await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();
  }
  await writeFile('evidence/T38-PC-camera.json',JSON.stringify(evidence,null,2));
 }finally{await context.close();await server.close();}
});

test('screen drag steers through intermediate headings at constant speed in practice and online',async({browser})=>{
 const server=createGameServer({config:{countdownSeconds:0.03},seed:()=>4});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const context=await browser.newContext({viewport:{width:844,height:700},hasTouch:true});
 await context.addInitScript(()=>{localStorage.setItem('hexhold.tutorialSeen','1');localStorage.setItem('hexhold.settings',JSON.stringify({mobileControls:'drag',killVibration:false}));});
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');
  const cdp=await context.newCDPSession(page),evidence:any[]=[];
  for(const mode of ['practice','online']){
   if(mode==='practice')await page.getByTestId('practice').click();
   else{await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();}
   await expect(page.locator('#hud')).toBeVisible();
   const initial=await page.evaluate(()=>{
    const api=(window as any).__HEXHOLD_TEST__,p=api.getView().participants.find((p:any)=>p.kind==='HUMAN');
    const direction=Math.abs(p.position.x)>Math.abs(p.position.y)?{x:p.position.x>0?-1:1,y:0}:{x:0,y:p.position.y>0?-1:1};
    api.direction(direction.x,direction.y);return direction;
   });
   const intended={x:-initial.y||0,y:initial.x||0};
   const config=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().config);expect(config.moveCellsPerSecond).toBe(4.2);expect(config.turnRadiansPerSecond).toBe(9);
   const speed=moveSpeed(config);
   await expect.poll(()=>page.evaluate(initial=>{const api=(window as any).__HEXHOLD_TEST__,d=api.getView().participants.find((p:any)=>p.kind==='HUMAN').direction;return Math.hypot(d.x-initial.x,d.y-initial.y);},initial)).toBe(0);
   // Capture before injecting touch: awaiting CDP and polling can consume much
   // of a 200ms fixed-step turn on a loaded headless browser.
   await page.evaluate(()=>{
    (window as any).__STEERING_SAMPLES__=new Promise<any[]>(resolve=>{
     const api=(window as any).__HEXHOLD_TEST__,samples:any[]=[];let start=0;
     const frame=(at:number)=>{if(!start)start=at;const state=api.getRenderState(),p=api.getView().participants.find((p:any)=>p.kind==='HUMAN');samples.push({...state,direction:api.inputDirection(),actual:p.direction,target:p.targetDirection});if(at-start>=1000)resolve(samples);else requestAnimationFrame(frame);};requestAnimationFrame(frame);
    });
   });
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:422,y:350,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:422+80*intended.x,y:350+80*intended.y,id:1}]});
   await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection()),{intervals:[10],timeout:1000}).toEqual(intended);
   const target=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection());
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   const samples=await page.evaluate(()=>(window as any).__STEERING_SAMPLES__) as any[];
   const firstTarget=samples.findIndex(s=>s.direction.x===target.x&&s.direction.y===target.y);expect(firstTarget).toBeGreaterThanOrEqual(0);
   expect(samples.slice(firstTarget).every(s=>s.direction.x===target.x&&s.direction.y===target.y),mode).toBe(true);
   expect(samples.at(-1).direction).toEqual(target);
   const intermediate=samples.filter(s=>{const dot=s.actual.x*target.x+s.actual.y*target.y;return dot>0.01&&dot<0.99;});
   expect(intermediate.length,mode+' gradual actual turn').toBeGreaterThan(0);
   expect(new Set(samples.map(s=>JSON.stringify(s.actual))).size,mode+' intermediate headings').toBeGreaterThan(2);
   await expect.poll(()=>page.evaluate(()=>{const api=(window as any).__HEXHOLD_TEST__;return api.getView().participants.find((p:any)=>p.kind==='HUMAN').direction;})).toEqual(target);
   expect(Math.max(...samples.map(s=>s.centerError))).toBeLessThan(0.01);
   const excess=samples.slice(1).flatMap((s,i)=>s.lifeId===samples[i].lifeId&&s.lifeState==='ALIVE'&&samples[i].lifeState==='ALIVE'?
    [Math.hypot(s.camera.x-samples[i].camera.x,s.camera.y-samples[i].camera.y)-(speed*(s.renderedAt-samples[i].renderedAt)/1000+12)]:[]);
   expect(excess.length).toBeGreaterThan(10);expect(Math.max(...excess),mode).toBeLessThanOrEqual(0);
   evidence.push({mode,initial,target,moveCellsPerSecond:config.moveCellsPerSecond,turnRadiansPerSecond:config.turnRadiansPerSecond,samples});await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();
  }
  await writeFile('evidence/mobile-swipe-turn-2026-10-02.json',JSON.stringify(evidence,null,2));
 }finally{await context.close();await server.close();}
});

test('continuous swipe U-turns publish the final reverse goal in practice and online',async({browser})=>{
 const server=createGameServer({config:{countdownSeconds:.03},seed:()=>4});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const context=await browser.newContext({viewport:{width:844,height:700},hasTouch:true});
 await context.addInitScript(()=>{localStorage.setItem('hexhold.tutorialSeen','1');localStorage.setItem('hexhold.settings',JSON.stringify({mobileControls:'drag',killVibration:false}));});
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');const cdp=await context.newCDPSession(page),evidence:any[]=[];
  for(const mode of ['practice','online']){
   if(mode==='practice')await page.getByTestId('practice').click();
   else{await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();}
   await expect(page.locator('#hud')).toBeVisible();
   const initial=await page.evaluate(()=>{
    const api=(window as any).__HEXHOLD_TEST__,p=api.getView().participants.find((p:any)=>p.kind==='HUMAN');
    const direction=Math.abs(p.position.x)>Math.abs(p.position.y)?{x:p.position.x>0?-1:1,y:0}:{x:0,y:p.position.y>0?-1:1};api.direction(direction.x,direction.y);return direction;
   });
   const perp={x:-initial.y,y:initial.x};
   const intended={x:-initial.x||0,y:-initial.y||0};
   await expect.poll(()=>page.evaluate(initial=>{const api=(window as any).__HEXHOLD_TEST__,d=api.getView().participants.find((p:any)=>p.kind==='HUMAN').direction;return Math.hypot(d.x-initial.x,d.y-initial.y);},initial)).toBe(0);
   await page.evaluate(()=>{
    (window as any).__UTURN_STOP__=false;(window as any).__UTURN_SAMPLES__=new Promise<any[]>(resolve=>{
     const api=(window as any).__HEXHOLD_TEST__,samples:any[]=[];let start=0;
     const frame=(at:number)=>{if(!start)start=at;const state=api.getRenderState(),p=api.getView().participants.find((p:any)=>p.kind==='HUMAN');samples.push({...state,actual:p.direction,target:p.targetDirection,input:api.inputDirection()});if((window as any).__UTURN_STOP__||at-start>8000)resolve(samples);else requestAnimationFrame(frame);};requestAnimationFrame(frame);
    });
   });
   const fingerPoints:{x:number;y:number}[]=[],touch=async(type:'touchStart'|'touchMove',u:number,v:number)=>{
    const point={x:422+initial.x*u+perp.x*v,y:350+initial.y*u+perp.y*v};fingerPoints.push(point);
    await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[{...point,id:1}]});
   };
   await touch('touchStart',0,0);await touch('touchMove',80,0);
   await touch('touchMove',55,0);
   expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection()),mode+' pullback on same side').toEqual(initial);
   await touch('touchMove',80,0);
   for(let i=1;i<=18;i++){const angle=i*Math.PI/18;await touch('touchMove',80*Math.cos(angle),80*Math.sin(angle));}
   await touch('touchMove',-125,0);await touch('touchMove',-170,0);
   await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection()),{intervals:[20]}).toEqual(intended);
   const target=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.inputDirection());
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await expect.poll(()=>page.evaluate(target=>{const api=(window as any).__HEXHOLD_TEST__,p=api.getView().participants.find((p:any)=>p.kind==='HUMAN').direction;return Math.hypot(p.x-target.x,p.y-target.y);},target),{intervals:[50]}).toBeLessThan(1e-9);
   await page.waitForTimeout(150);await page.evaluate(()=>(window as any).__UTURN_STOP__=true);
   const samples=await page.evaluate(()=>(window as any).__UTURN_SAMPLES__) as any[];
   expect(samples.every(s=>s.lifeState==='ALIVE'),mode).toBe(true);
   expect(samples.at(-1).input.x).toBeCloseTo(target.x,9);expect(samples.at(-1).input.y).toBeCloseTo(target.y,9);
   expect(new Set(samples.map(s=>JSON.stringify(s.actual))).size,mode+' gradual turn').toBeGreaterThan(2);
   expect(Math.max(...samples.map(s=>s.centerError))).toBeLessThan(.01);
   const config=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView().config),speed=moveSpeed(config);
   const tolerance=mode==='practice'?speed/config.simulationHz:12;
   const excess=samples.slice(1).map((s,i)=>Math.hypot(s.camera.x-samples[i].camera.x,s.camera.y-samples[i].camera.y)-speed*(s.renderedAt-samples[i].renderedAt)/1000-tolerance);
   expect(excess.length).toBeGreaterThan(10);expect(Math.max(...excess),mode).toBeLessThanOrEqual(0);
   evidence.push({mode,initial,intended,target,config:{moveCellsPerSecond:config.moveCellsPerSecond,turnRadiansPerSecond:config.turnRadiansPerSecond},fingerPoints,samples});
   await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();
  }
  await writeFile('evidence/mobile-swipe-camera-2026-10-02.json',JSON.stringify(evidence,null,2));
 }finally{await context.close();await server.close();}
});

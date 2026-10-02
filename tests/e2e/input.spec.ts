import {test,expect,type Browser} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

async function touchFixture(browser:Browser){
 const context=await browser.newContext({viewport:{width:844,height:700},hasTouch:true});
 const page=await context.newPage();await page.goto('http://127.0.0.1:5173/tests/fixtures/input.html');
 await page.waitForFunction(()=>!!(window as any).fixture);
 await page.evaluate(()=>(window as any).fixture.input.setMobileControls('drag'));
 const cdp=await context.newCDPSession(page);
 const vector=()=>page.evaluate(()=>(window as any).fixture.input.direction);
 const touch=async(type:'touchStart'|'touchMove',x:number,y:number)=>{
  const count=await page.evaluate(()=>(window as any).fixture.points.length);
  await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[{x,y,id:1}]});
  // Wait for the actual PointerEvent before injecting the next swipe leg.
  await expect.poll(()=>page.evaluate(()=>{const points=(window as any).fixture.points;return{count:points.length,last:points.at(-1)};})).toMatchObject({last:{x,y}});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.points.length)).toBeGreaterThan(count);
 };
 const end=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 return{context,page,cdp,vector,touch,end};
}

test('T17 keyboard, mouse and release retain the last valid normalized direction',async({page})=>{
 await page.goto('http://127.0.0.1:5173/tests/fixtures/input.html');
 await page.waitForFunction(()=>Boolean((window as any).fixture));
 await page.bringToFront();await page.locator('#surface').click({position:{x:400,y:300}});
 const vector=()=>page.evaluate(()=>((window as any).fixture.vectors as any[]).at(-1));
 await page.keyboard.down('w');await page.mouse.move(700,320);await page.waitForTimeout(60);expect(await page.evaluate(()=>(window as any).fixture.input.direction)).toEqual({x:0,y:-1});await page.keyboard.down('d');await page.waitForTimeout(100);
 let v=await vector();expect(v.x).toBeCloseTo(Math.SQRT1_2);expect(v.y).toBeCloseTo(-Math.SQRT1_2);
 await page.keyboard.up('w');await page.keyboard.up('d');await page.waitForTimeout(120);
 v=await vector();expect(v.x).toBeCloseTo(1);expect(v.y).toBeCloseTo(0);
 await page.mouse.move(408,558);await page.waitForTimeout(120);v=await vector();expect(v.y).toBeGreaterThan(0.9);
 await page.keyboard.down('a');await page.waitForTimeout(120);v=await vector();expect(v.x).toBe(-1);
 await page.keyboard.up('a');await page.waitForTimeout(150);expect((await vector()).x).toBe(-1);
 await page.locator('#nickname').fill('wasd');expect(await page.locator('#nickname').inputValue()).toBe('wasd');
 const count=await page.evaluate(()=>{const f=(window as any).fixture;return f.vectors.filter((v:any)=>v.time>=performance.now()-1000).length;});
 expect(count).toBeLessThanOrEqual(30);
 await page.evaluate(()=>(window as any).fixture.input.dispose());const before=await page.evaluate(()=>(window as any).fixture.vectors.length);
 await page.waitForTimeout(150);expect(await page.evaluate(()=>(window as any).fixture.vectors.length)).toBe(before);
});

test('touch down never aims at the finger; swipes, pullbacks and release publish only intent',async({browser})=>{
 const f=await touchFixture(browser);try{
  const calls=await f.page.evaluate(()=>(window as any).fixture.pointerCalls.length);
  await f.touch('touchStart',700,450);expect(await f.vector()).toEqual({x:1,y:0});
  for(const [x,y] of [[703,447],[698,452],[701,449]]){await f.touch('touchMove',x,y);expect(await f.vector()).toEqual({x:1,y:0});}
  await f.touch('touchMove',700,405);expect(await f.vector()).toEqual({x:0,y:-1});
  expect(await f.page.evaluate(()=>(window as any).fixture.vectors.some((v:any)=>v.x>0&&v.y<0))).toBe(false);
  await f.touch('touchMove',745,405);expect(await f.vector()).toEqual({x:1,y:0});
  await f.touch('touchMove',720,405);expect(await f.vector()).toEqual({x:1,y:0});
  await f.touch('touchMove',700,405);expect(await f.vector()).toEqual({x:-1,y:0});
  expect(await f.page.evaluate(()=>(window as any).fixture.pointerCalls.length)).toBe(calls);
  await f.page.mouse.move(600,300);expect(await f.vector()).toEqual({x:-1,y:0});
  await f.end();await f.page.waitForTimeout(400);expect(await f.vector()).toEqual({x:-1,y:0});
  await f.touch('touchStart',100,550);expect(await f.vector()).toEqual({x:-1,y:0});await f.end();
 }finally{await f.context.close();}
});

test('long same-heading drags do not attenuate the next perpendicular swipe',async({browser})=>{
 const f=await touchFixture(browser);try{
  const evidence:any[]=[];
  for(const distance of [40,160,400]){
   await f.page.evaluate(()=>(window as any).fixture.input.setDirection({x:1,y:0}));
   await f.touch('touchStart',100,300);await f.touch('touchMove',100+distance,300);
   expect(await f.vector()).toEqual({x:1,y:0});
   await f.touch('touchMove',100+distance,255);expect(await f.vector()).toEqual({x:0,y:-1});
   evidence.push({straightPixels:distance,perpendicularPixels:45,target:await f.vector()});await f.end();
  }
  await writeFile('evidence/mobile-swipe-distance-2026-10-02.json',JSON.stringify(evidence,null,2));
 }finally{await f.context.close();}
});

test('small noisy rightward paths and stationary jitter do not repeatedly redirect the target',async({browser})=>{
 const f=await touchFixture(browser);try{
  await f.page.evaluate(()=>(window as any).fixture.input.setDirection({x:0,y:-1}));
  await f.touch('touchStart',100,450);const headings:any[]=[];
  for(let i=1;i<=30;i++){
   await f.touch('touchMove',100+4*i,450+[0,1,-2,3,-1,-3][i%6]);
   const heading=await f.vector();headings.push(heading);
   if(i>=7){expect(heading.x).toBeGreaterThanOrEqual(Math.cos(Math.atan2(6,28)));expect(Math.abs(heading.y)).toBeLessThanOrEqual(Math.sin(Math.atan2(6,28)));}
  }
  const held=await f.vector();
  for(const [dx,dy] of [[1,1],[-2,3],[3,-1],[-1,-3],[2,2]]){await f.touch('touchMove',220+dx,450+dy);expect(await f.vector()).toEqual(held);}
  const changes=headings.filter((h,i)=>i===0||h.x!==headings[i-1].x||h.y!==headings[i-1].y).length;
  expect(changes).toBeLessThanOrEqual(5);
  await f.end();await writeFile('evidence/mobile-swipe-noise-2026-10-02.json',JSON.stringify({headings,changes,held},null,2));
 }finally{await f.context.close();}
});

test('secondary touches cannot steal a primary swipe or become primary mid-gesture',async({browser})=>{
 const f=await touchFixture(browser);try{
  await f.touch('touchStart',400,400);
  await f.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:400,y:400,id:1},{x:600,y:500,id:2}]});
  expect(await f.vector()).toEqual({x:1,y:0});
  await f.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:400,y:355,id:1},{x:550,y:500,id:2}]});
  await expect.poll(f.vector).toEqual({x:0,y:-1});
  await f.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:550,y:500,id:2}]});
  await f.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:450,y:500,id:2}]});
  await f.page.waitForTimeout(60);expect(await f.vector()).toEqual({x:0,y:-1});await f.end();
  await f.touch('touchStart',400,400);await f.touch('touchMove',445,400);expect(await f.vector()).toEqual({x:1,y:0});await f.end();
 }finally{await f.context.close();}
});

test('cancel, lost capture, resize, blur, disable and mode changes cannot revive old gestures',async({browser})=>{
 const f=await touchFixture(browser);try{
  for(const action of ['cancel','lost','resize','blur','disable','switch']){
   await f.page.evaluate(()=>(window as any).fixture.input.setDirection({x:0,y:-1}));
   await f.touch('touchStart',400,400);await f.touch('touchMove',445,400);expect(await f.vector()).toEqual({x:1,y:0});
   await f.page.evaluate(action=>{
    const input=(window as any).fixture.input,id=(window as any).fixture.points.at(-1).id;
    if(action==='cancel'||action==='lost')document.querySelector('#surface')!.dispatchEvent(new PointerEvent(action==='cancel'?'pointercancel':'lostpointercapture',{pointerId:id,pointerType:'touch',isPrimary:true}));
    else if(action==='disable'){input.enabled=false;input.enabled=true;}
    else if(action==='switch'){input.setMobileControls('joystick');input.setMobileControls('drag');}
    else window.dispatchEvent(new Event(action));
   },action);
   await f.touch('touchMove',445,355);expect(await f.vector()).toEqual({x:1,y:0});await f.end();
  }
  await f.touch('touchStart',400,400);await f.page.evaluate(()=>(window as any).fixture.input.dispose());
  const count=await f.page.evaluate(()=>(window as any).fixture.vectors.length);
  await f.touch('touchMove',350,400);await f.end();await f.page.waitForTimeout(120);
  expect(await f.page.evaluate(()=>(window as any).fixture.vectors.length)).toBe(count);
 }finally{await f.context.close();}
});

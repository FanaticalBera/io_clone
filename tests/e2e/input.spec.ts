import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
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
test('screen touch points toward the finger, keeps a same-side pullback and retains direction after release',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:700},hasTouch:true});try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/tests/fixtures/input.html');await page.waitForFunction(()=>!!(window as any).fixture);await page.evaluate(()=>(window as any).fixture.input.setMobileControls('drag'));const cdp=await context.newCDPSession(page),send=(type:'touchStart'|'touchMove'|'touchEnd',touchPoints:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints}),vector=()=>page.evaluate(()=>(window as any).fixture.input.direction);
  await send('touchStart',[{x:400,y:300,id:1}]);await send('touchMove',[{x:400,y:290,id:1}]);await page.waitForTimeout(50);expect(await vector()).toEqual({x:1,y:0});
  await send('touchMove',[{x:400,y:255,id:1}]);await expect.poll(vector).toEqual({x:0,y:-1});
  expect(await page.evaluate(()=>(window as any).fixture.vectors.some((v:any)=>v.x>0&&v.y<0))).toBe(false);
  await send('touchMove',[{x:400.5,y:255,id:1}]);await page.waitForTimeout(50);expect(await vector()).toEqual({x:0,y:-1});
  await send('touchEnd',[]);await send('touchStart',[{x:400,y:300,id:1}]);
  await send('touchMove',[{x:445,y:300,id:1}]);await expect.poll(vector).toEqual({x:1,y:0});
  // A 15px pullback must not become a reverse direction.
  await send('touchMove',[{x:430,y:300,id:1}]);await page.waitForTimeout(60);expect(await vector()).toEqual({x:1,y:0});
  await send('touchMove',[{x:420,y:300,id:1}]);await page.waitForTimeout(60);expect(await vector()).toEqual({x:1,y:0});
  await send('touchMove',[{x:480,y:300,id:1}]);await send('touchMove',[{x:440,y:300,id:1}]);await page.waitForTimeout(60);expect(await vector()).toEqual({x:1,y:0});
  // A second pointer source must not take over a captured finger gesture.
  await page.mouse.move(200,300);expect(await vector()).toEqual({x:1,y:0});
  await send('touchMove',[{x:360,y:300,id:1}]);await expect.poll(vector).toEqual({x:-1,y:0});
  await send('touchEnd',[]);await page.waitForTimeout(400);expect(await vector()).toEqual({x:-1,y:0});
 }finally{await context.close();}
});

test('mouse and touch request the same headings at identical screen positions',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:700},hasTouch:true});try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/tests/fixtures/input.html');await page.waitForFunction(()=>!!(window as any).fixture);
  await page.evaluate(()=>(window as any).fixture.input.setMobileControls('drag'));
  const cdp=await context.newCDPSession(page),evidence:any[]=[];
  for(const point of [{x:600,y:300},{x:400,y:120},{x:200,y:300},{x:400,y:480},{x:500,y:400},{x:600,y:255}]){
   await page.evaluate(()=>(window as any).fixture.input.setDirection({x:1,y:0}));
   await page.mouse.move(point.x,point.y);
   const expected={x:(point.x-400)/Math.hypot(point.x-400,point.y-300),y:(point.y-300)/Math.hypot(point.x-400,point.y-300)};
   await expect.poll(()=>page.evaluate(()=>(window as any).fixture.input.direction)).toEqual(expected);
   const pcHeading=await page.evaluate(()=>(window as any).fixture.input.direction);
   await page.evaluate(()=>(window as any).fixture.input.setDirection({x:1,y:0}));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:300,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});
   await expect.poll(()=>page.evaluate(()=>(window as any).fixture.input.direction)).toEqual(pcHeading);
   const heading=await page.evaluate(()=>(window as any).fixture.input.direction);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   evidence.push({point,touchHeading:heading,pcHeading});
  }
  await writeFile('evidence/mobile-pointer-input-comparison.json',JSON.stringify(evidence,null,2));
 }finally{await context.close();}
});
test('touch gestures cannot resume after disable, rotation, control switch or disposal',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:700},hasTouch:true});try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/tests/fixtures/input.html');await page.waitForFunction(()=>!!(window as any).fixture);await page.evaluate(()=>(window as any).fixture.input.setMobileControls('drag'));const cdp=await context.newCDPSession(page),send=(type:'touchStart'|'touchMove'|'touchEnd',points:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points}),vector=()=>page.evaluate(()=>(window as any).fixture.input.direction);
  for(const action of ['disable','rotate','switch']){
   await send('touchStart',[{x:400,y:300,id:1}]);await send('touchMove',[{x:400,y:345,id:1}]);await expect.poll(vector).toEqual({x:0,y:1});
   await page.evaluate(action=>{const input=(window as any).fixture.input;if(action==='disable'){input.enabled=false;input.enabled=true;}else if(action==='rotate')window.dispatchEvent(new Event('resize'));else{input.setMobileControls('joystick');input.setMobileControls('drag');}},action);
   await send('touchMove',[{x:445,y:300,id:1}]);expect(await vector()).toEqual({x:0,y:1});await send('touchEnd',[]);
  }
  await page.evaluate(()=>(window as any).fixture.input.setDirection({x:1,y:0}));
  await send('touchStart',[{x:400,y:300,id:1}]);await send('touchMove',[{x:400,y:255,id:1}]);
  const stopped=await page.evaluate(()=>{const input=(window as any).fixture.input;input.enabled=false;input.enabled=true;return {...input.direction};});
  await page.waitForTimeout(400);expect(await vector()).toEqual(stopped);await send('touchEnd',[]);
  await send('touchStart',[{x:400,y:300,id:1}]);await page.evaluate(()=>(window as any).fixture.input.dispose());const count=await page.evaluate(()=>(window as any).fixture.vectors.length);await send('touchMove',[{x:350,y:300,id:1}]);await send('touchEnd',[]);await page.waitForTimeout(120);expect(await page.evaluate(()=>(window as any).fixture.vectors.length)).toBe(count);
 }finally{await context.close();}
});

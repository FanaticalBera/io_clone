import {test,expect} from '@playwright/test';
import {networkInterfaces,cpus,totalmem,release,platform} from 'node:os';
import {writeFile} from 'node:fs/promises';
test('T36 production serves the full game and two clients through a local non-loopback interface',async({browser})=>{
 test.setTimeout(90000);
 const address=Object.values(networkInterfaces()).flat().find(i=>i?.family==='IPv4'&&!i.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))?.address;
 test.skip(!address,'No private local network interface available');const base='http://'+address+':3001';
 expect((await fetch(base+'/healthz')).status).toBe(200);
 const ca=await browser.newContext({viewport:{width:1280,height:800}}),cb=await browser.newContext();
 for(const c of [ca,cb])await c.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
 const a=await ca.newPage(),b=await cb.newPage();await a.goto(base);expect(await a.evaluate(()=>(window as any).__HEXHOLD_TEST__)).toBeUndefined();
 await a.getByTestId('nickname').fill('PC A');await a.screenshot({path:'evidence/T36-production-menu.png'});await a.getByTestId('create').click();await expect(a.locator('#room-panel')).toBeVisible();
 const code=await a.locator('#friend-code').textContent();await b.goto(base+'/?room='+code);await b.getByTestId('nickname').fill('PC B');await b.getByTestId('join').click();await expect(a.locator('#members')).toContainText('PC B');await a.getByTestId('start').click();await expect(a.locator('#hud')).toBeVisible();
 await expect(b.locator('#hud')).toBeVisible();expect(await a.locator('#hud').getAttribute('data-match-id')).toBe(await b.locator('#hud').getAttribute('data-match-id'));
 await a.keyboard.down('d');await a.waitForTimeout(300);await a.keyboard.up('d');
 const frameTimes=await a.evaluate(()=>new Promise<number[]>(resolve=>{const intervals:number[]=[];let previous=0,start=0;const frame=(t:number)=>{if(!start)start=t;if(previous)intervals.push(t-previous);previous=t;if(t-start>=20000)resolve(intervals);else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
 const hardware=await a.evaluate(()=>{const canvas=document.querySelector<HTMLCanvasElement>('#field canvas')!,gl=(canvas.getContext('webgl')||canvas.getContext('webgl2')) as WebGLRenderingContext|null,ext=gl?.getExtension('WEBGL_debug_renderer_info');return{userAgent:navigator.userAgent,dpr:devicePixelRatio,canvas:[canvas.width,canvas.height],renderer:ext?gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'};});
 const sorted=[...frameTimes].sort((a,b)=>a-b),mean=frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length;
 await writeFile('evidence/T36-PC-automated.json',JSON.stringify({condition:'Headless Chromium rAF sampling on this Windows CPU; local virtual interface, no external Android/LAN device and no interactive FPS acceptance claim',os:{platform:platform(),release:release(),cpu:cpus()[0]?.model,logicalCores:cpus().length,ramBytes:totalmem()},browser:browser.version(),hardware,sampleSeconds:20,frames:frameTimes.length,averageFPS:1000/mean,p95FrameMs:sorted[Math.floor(sorted.length*.95)],lowOnePercentFPS:1000/sorted[Math.floor(sorted.length*.99)]},null,2));
 await a.screenshot({path:'evidence/T36-production-game.png'});await a.getByTestId('leave').click();await b.getByTestId('leave').click();
 }finally{await ca.close();await cb.close();}
});

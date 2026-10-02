import {test,expect} from '@playwright/test';
import {createGameServer} from '../../src/server/app.js';
import {experimentalMapConfig} from '../../src/shared/map-experiment.js';
test('development-only radius URLs run the same eight-participant practice with no persisted map option',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 for(const radius of [22,28,32,36]){
  await page.goto(`http://127.0.0.1:5174/?experimentMapRadius=${radius}&experimentSeed=4`);await page.getByTestId('nickname').fill('맵 실험');await page.getByTestId('practice').click();
  await expect(page.locator('#hud')).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView()?.owners.length)).toBe(1+3*radius*(radius+1));
  const state=await page.evaluate(()=>{const view=(window as any).__HEXHOLD_TEST__.getView();return {seed:view.seed,config:view.config,participants:view.participants.length,mode:view.gameMode};});
  expect(state.seed).toBe(4);expect(state.config).toMatchObject({mapRadius:radius,spawnRadius:2,spawnBufferHexes:3,respawnSeconds:3,maxSlots:8,moveCellsPerSecond:4.2,turnRadiansPerSecond:9});expect(state.participants).toBe(8);expect(state.mode).toEqual({id:'classic'});
  if(radius===32||radius===36)await page.screenshot({path:`evidence/map-size/dev-R${radius}.png`});
 }
 await page.goto('http://127.0.0.1:5174/');await page.getByTestId('nickname').fill('기본');await page.getByTestId('practice').click();await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView()?.config.mapRadius)).toBe(22);expect(errors).toEqual([]);
});
test('production ignores experiment radius and seed URL parameters',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));await page.goto('http://127.0.0.1:3004/?experimentMapRadius=36&experimentSeed=4');
 await page.getByTestId('nickname').fill('운영 기본값');await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#score-detail')).toContainText('/ 1519칸');
});
test('production server also ignores MAP_EXPERIMENT_RADIUS=36 for a real online room',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));await page.goto('http://127.0.0.1:3004/');await page.getByTestId('nickname').fill('서버 기본값');await page.getByTestId('create').click();await expect(page.locator('#room-panel')).toBeVisible();await page.getByTestId('start').click();
 await expect(page.locator('#hud')).toBeVisible({timeout:12000});await expect(page.locator('#score-detail')).toContainText('/ 1519칸');
});
for(const radius of [32,36])test(`R${radius} development server: two HUMAN clients and six BOTs share the real Hold room`,async({browser})=>{
 process.env.NODE_ENV='test';const server=createGameServer({config:experimentalMapConfig(String(radius),true),seed:()=>4});await new Promise<void>(r=>server.http.listen(3002,'127.0.0.1',r));
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);for(const c of contexts)await c.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const a=await contexts[0].newPage(),b=await contexts[1].newPage();await a.goto('http://127.0.0.1:5174');await b.goto('http://127.0.0.1:5174');
  await a.getByTestId('nickname').fill('A');await b.getByTestId('nickname').fill('B');await a.locator('#mode-next').click();await expect(a.locator('#mode-name')).toHaveText('HOLD');await a.getByTestId('create').click();await expect(a.locator('#room-panel')).toBeVisible();
  await b.getByTestId('room-code').fill((await a.locator('#friend-code').textContent())!);await b.getByTestId('join').click();await expect(a.locator('#members')).toContainText('B');await a.getByTestId('start').click();
  for(const page of [a,b]){await expect(page.locator('#hud')).toBeVisible({timeout:12000});await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView()?.owners.length)).toBe(1+3*radius*(radius+1));
   const view=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getView());expect(view.participants.filter((p:any)=>p.kind==='HUMAN')).toHaveLength(2);expect(view.participants.filter((p:any)=>p.kind==='BOT')).toHaveLength(6);expect(view.gameMode).toEqual({id:'hold',targetPercent:50,holdSeconds:10});expect(view.config).toMatchObject({spawnRadius:2,spawnBufferHexes:3,respawnSeconds:3,moveCellsPerSecond:4.2,turnRadiansPerSecond:9});
  }
 }finally{await Promise.all(contexts.map(c=>c.close()));await server.close();}
});

import {test,expect} from '@playwright/test';
test('practice HUD exposes 13 bots, real reasons, selection and camera follow, and tears down on exit',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&experimentSeed=19');await page.getByTestId('nickname').fill('밤산책');await page.getByTestId('practice').click();
 const hud=page.locator('#bot-debug-hud');await expect(hud).toBeVisible();await expect(hud.locator('div>button')).toHaveCount(13);await expect(hud.locator('pre')).toContainText('선택:');
 const snapshot=await page.evaluate(()=>{const p=(window as any).__HEXHOLD_TEST__.getPractice();p.setPaused(true);return p.botDiagnostics();});
 expect(snapshot.phase02.version).toBe('phase02-v1');expect(snapshot.director.stats.maxPlanned).toBeLessThanOrEqual(3);expect(snapshot.bots).toHaveLength(13);expect(snapshot.bots.some((b:any)=>b.nickname==='밤산책')).toBe(false);
 const counts=Object.values(snapshot.bots.reduce((s:any,b:any)=>{s[b.personality]=(s[b.personality]??0)+1;return s;},{})).sort();expect(counts).toEqual([3,3,3,4]);
 expect(snapshot.bots.every((b:any)=>b.identity.active)).toBe(true);await expect(hud).not.toContainText('비활성');await expect(hud.locator('pre')).toContainText('현재 계획을 세운 판단');await expect(hud.locator('pre')).toContainText('pressure');await expect(hud.locator('pre')).toContainText('%p (표시 전용)');
 await hud.locator('div>button').nth(4).click();await expect(hud.locator('pre')).toContainText('#5 ');
 await hud.getByRole('button',{name:'선택 봇 따라보기',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().isBotDebugFollowing())).toBe(true);
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.enabled())).toBe(false);
 await page.screenshot({path:'.local/bot-grudge/hud.png'});
 await hud.getByRole('button',{name:'내 화면으로',exact:true}).click();expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().isBotDebugFollowing())).toBe(false);
 await hud.getByRole('button',{name:'접기',exact:true}).click();await expect(hud.locator('pre')).toBeHidden();await hud.getByRole('button',{name:'펼치기',exact:true}).click();await expect(hud.locator('pre')).toBeVisible();
 await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await expect(hud).toBeHidden();
 expect(errors).toEqual([]);
});
test('debug HUD stays absent without the flag and on production even with debug=1',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 for(const url of ['/?spectate=1&experimentSeed=19','http://127.0.0.1:5312/?debug=1&spectate=1&experimentSeed=19']){
  await page.goto(url);await page.getByTestId('nickname').fill('검증');await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#bot-debug-hud')).toHaveCount(0);
  expect(await page.evaluate(()=>('__HEXHOLD_DIAGNOSTICS__' in window))).toBe(false);await expect(page.locator('#population')).toContainText('사람 1 · 봇 13');
 }
});

test('14-bot spectator survives deaths, follows bots, pauses cleanly and disposes independently of human practice',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&spectate=1&experimentSeed=19');await page.getByTestId('nickname').fill('관전');await page.getByTestId('practice').click();
 const hud=page.locator('#bot-debug-hud');await expect(hud.locator('div>button')).toHaveCount(14);await expect(page.locator('#score')).toHaveText('봇 관전');await expect(page.locator('#population')).toContainText('사람 0 · 봇 14');
 await hud.locator('div>button').nth(5).click();await hud.getByRole('button',{name:'선택 봇 따라보기',exact:true}).click();
 const advanced=await page.evaluate(()=>{const api=(window as any).__HEXHOLD_TEST__,p=api.getPractice();p.setPaused(true);const before=p.match.tick;p.advance(10000);if(p.match.tick!==before)throw Error('Paused spectator advanced');p.setPaused(false);p.advance(0);
  for(let n=1;n<=1800;n++)p.advance(n*1000/p.match.config.simulationHz);p.setPaused(true);api.showPracticeView();
  return {spectating:p.spectating,selfId:p.selfId,bots:p.match.participants.map((b:any)=>({kind:b.kind,deaths:b.deaths})),ticks:p.match.tick-before,phase:p.match.phase,enabled:api.enabled(),following:api.getScene().isBotDebugFollowing()};});
 expect(advanced.spectating).toBe(true);expect(advanced.selfId).toBeNull();expect(advanced.bots).toHaveLength(14);expect(advanced.bots.every((b:any)=>b.kind==='BOT')).toBe(true);expect(advanced.bots.some((b:any)=>b.deaths>0)).toBe(true);
 expect(advanced.ticks).toBe(1800);expect(advanced.phase).toBe('RUNNING');expect(advanced.enabled).toBe(false);expect(advanced.following).toBe(true);await expect(page.locator('#death')).toBeHidden();await expect(hud.locator('pre')).toContainText('현재 계획을 세운 판단');
 await expect.poll(()=>page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getRenderState().centerError)).toBeLessThan(1);
 const bounds=await hud.boundingBox();expect(bounds!.x).toBeGreaterThan(640);
 await hud.locator('pre').scrollIntoViewIfNeeded();await page.screenshot({path:'.local/bot-grudge/spectator.png'});
 await hud.getByRole('button',{name:'전체 판 보기',exact:true}).click();expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().isBotDebugFollowing())).toBe(false);
 await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await expect(hud).toBeHidden();
 await page.goto('/?debug=1&experimentSeed=19');await page.getByTestId('practice').click();
 const normal=await page.evaluate(()=>{const api=(window as any).__HEXHOLD_TEST__,p=api.getPractice();p.setPaused(true);const human=p.match.participants.find((b:any)=>b.kind==='HUMAN');human.lifeState='ELIMINATED';const tick=p.match.tick;p.setPaused(false);p.advance(0);p.advance(500);p.setPaused(true);return {tick,after:p.match.tick,spectating:p.spectating};});
 expect(normal.spectating).toBe(false);expect(normal.after).toBe(normal.tick);
 await hud.getByRole('button',{name:'14봇 관전 시작',exact:true}).click();await expect(hud.locator('div>button')).toHaveCount(14);expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().spectating)).toBe(true);expect(errors).toEqual([]);
});

test('grudge HUD identifies the actual distant thief and explains unawarded captures',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&spectate=1&experimentSeed=19');await page.getByTestId('nickname').fill('원한 확인');await page.getByTestId('practice').click();
 await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().setPaused(true));
 const hud=page.locator('#bot-debug-hud');await hud.locator('div>button').nth(8).click();
 const result=await page.evaluate(async()=>{
  const territoryPath='/src/shared/territory.ts',enginePath='/src/shared/engine.ts',directorPath='/src/shared/bot-director.ts';
  const [{neutralizeTerritory,setOwner,addTrail},{applySimultaneousCaptures},{getBotInputs}]=await Promise.all([import(territoryPath),import(enginePath),import(directorPath)]);
  const api=(window as any).__HEXHOLD_TEST__,p=api.getPractice(),m=p.match,victim=m.participants.find((b:any)=>b.slot===8),thief=m.participants.find((b:any)=>b.slot===2),id=(q:number,r=0)=>m.map.byKey.get(q+','+r);
  neutralizeTerritory(m,victim);neutralizeTerritory(m,thief);victim.cellId=id(0);victim.position={...m.map.cells[victim.cellId].center};thief.cellId=id(19);thief.position={...m.map.cells[thief.cellId].center};
  setOwner(m,id(0),victim.slot+1);setOwner(m,id(19),thief.slot+1);
  const capture=(count:number)=>{for(let n=1;n<=count;n++){setOwner(m,id(-n,1),victim.slot+1);addTrail(m,thief,id(-n,1));}applySimultaneousCaptures(m,[thief]);getBotInputs(m,p.memories);};
  capture(6);m.tick+=30;capture(5);m.tick+=15;capture(6);m.tick+=15;api.showPracticeView();
  const row=p.botDiagnostics().bots.find((b:any)=>b.slot===8);return {thief:thief.nickname,victim:victim.nickname,row};
 });
 expect(result.row.grudgeEvents.slice(-3).map((e:any)=>[e.slot,e.cells,e.ignored])).toEqual([[2,6,undefined],[2,5,'BELOW_THRESHOLD'],[2,6,'COOLDOWN']]);
 expect(result.row.emotion.grudges.find((g:any)=>g.slot===2).lastEvent).toMatchObject({reason:'CAPTURE',delta:3,cells:6});
 await expect(hud.locator('pre')).toContainText('#2 '+result.thief);await expect(hud.locator('pre')).toContainText('최근 적립: 영토 6칸 탈취 · +3.00 · 2.0초 전');
 await expect(hud.locator('pre')).toContainText('영토 5칸 탈취 · 미적립 (6칸 미만)');await expect(hud.locator('pre')).toContainText('영토 6칸 탈취 · 미적립 (재적립 대기 2초)');
 await hud.evaluate(el=>{el.scrollTop=el.querySelector('pre')!.offsetTop-12;});await page.screenshot({path:'.local/bot-grudge/grudge-causes.png'});expect(errors).toEqual([]);
});

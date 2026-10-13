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
 for(const url of ['/?spectate=1&experimentSeed=19',(process.env.BOT_PRODUCTION_PREVIEW_URL??'http://127.0.0.1:5312')+'/?debug=1&spectate=1&experimentSeed=19']){
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
 const combat=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState());
 expect(combat.played).toBeGreaterThan(0);expect(combat).toMatchObject({kills:0,deaths:0,feedback:null});
 await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.showPracticeView());
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getCombatState().played)).toBe(combat.played);
 const schedules=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().botDiagnostics().bots.map((b:any)=>({slot:b.slot,cadence:b.cadence})));expect(schedules.every((b:any)=>b.cadence?.strategyTicks===6&&b.cadence.strategyPhase===b.slot%6)).toBe(true);await expect(hud).toContainText('3B 후보 (전술 100ms)');await expect(hud.locator('pre')).toContainText('전략 주기 200ms 고정 · 전술 100ms · 개인별 전략 OFF');
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
 expect(result.row.grudgeEvents.slice(-3).map((e:any)=>[e.slot,e.cells,e.ignored])).toEqual([[2,6,undefined],[2,5,'COOLDOWN'],[2,6,'COOLDOWN']]);
 expect(result.row.emotion.grudges.find((g:any)=>g.slot===2).lastEvent).toMatchObject({reason:'CAPTURE',delta:3,cells:6});
 await expect(hud.locator('pre')).toContainText('#2 '+result.thief);await expect(hud.locator('pre')).toContainText('최근 적립: 영토 6칸 탈취 (최근 누적 6칸) · +3.00 · 2.0초 전');
 await expect(hud.locator('pre')).toContainText('영토 5칸 탈취 (최근 누적 0칸) · 미적립 (재적립 대기 2초)');await expect(hud.locator('pre')).toContainText('영토 6칸 탈취 (최근 누적 0칸) · 미적립 (재적립 대기 2초)');
 await hud.evaluate(el=>{el.scrollTop=el.querySelector('pre')!.offsetTop-12;});await page.screenshot({path:'.local/bot-grudge/grudge-causes.png'});expect(errors).toEqual([]);
});

test('phase 2.5 HUD accumulates public remote theft, explains the cooldown, and shows region memory while the existing plan continues',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&spectate=1&experimentSeed=19');await page.getByTestId('nickname').fill('누적 확인');await page.getByTestId('practice').click();
 await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().setPaused(true));const hud=page.locator('#bot-debug-hud');await hud.locator('div>button').nth(8).click();
 const row=await page.evaluate(async()=>{
  const territoryPath='/src/shared/territory.ts',enginePath='/src/shared/engine.ts',directorPath='/src/shared/bot-director.ts';
  const [{neutralizeTerritory,setOwner,addTrail},{applySimultaneousCaptures},{getBotInputs}]=await Promise.all([import(territoryPath),import(enginePath),import(directorPath)]);
  const api=(window as any).__HEXHOLD_TEST__,p=api.getPractice(),m=p.match,a=m.participants.find((b:any)=>b.slot===8),b=m.participants.find((b:any)=>b.slot===2),id=(q:number,r=0)=>m.map.byKey.get(q+','+r);
  neutralizeTerritory(m,a);neutralizeTerritory(m,b);a.cellId=id(0);a.position={...m.map.cells[a.cellId].center};b.cellId=id(22);b.position={...m.map.cells[b.cellId].center};setOwner(m,a.cellId,a.slot+1);setOwner(m,b.cellId,b.slot+1);
  const capture=(qs:number[])=>{for(const q of qs){setOwner(m,id(q,1),a.slot+1);addTrail(m,b,id(q,1));}applySimultaneousCaptures(m,[b]);getBotInputs(m,p.memories);};
  capture([14,15,16]);m.tick+=30;capture([17,18,19]);m.tick+=15;capture([20]);api.showPracticeView();return p.botDiagnostics().bots.find((b:any)=>b.slot===8);
 });
 expect(row.grudgeEvents.slice(-3).map((e:any)=>[e.cells,e.accumulated,e.observedCells,e.ignored])).toEqual([[3,3,0,'BELOW_THRESHOLD'],[3,6,0,undefined],[1,0,0,'COOLDOWN']]);
 expect(row.damage.opponents.find((d:any)=>d.slot===2)).toMatchObject({accumulated:0,total:7,local:0});expect(row.damage.regions).toHaveLength(7);expect(row.emotion.recentDamage).toBe(0);
 await expect(hud.locator('pre')).toContainText('최근 누적 6칸');await expect(hud.locator('pre')).toContainText('전체 7 / 근처 0 / 관측 밖 7');await expect(hud.locator('pre')).toContainText('피해 구역 7/96칸');
 await expect(hud.locator('pre')).toContainText('REPOSITION:');await expect(hud.locator('pre')).toContainText('누적 6칸 미만');expect(errors).toEqual([]);
 await hud.evaluate(el=>{el.scrollTop=el.querySelector('pre')!.offsetTop-12;});await page.screenshot({path:'.local/bot-phase025/remote-loss-hud.png'});
});


test('spectator overlays expected damaged cells and reports exact recovery separately from ordinary theft',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&spectate=1&experimentSeed=73');await page.getByTestId('nickname').fill('되찾기 확인');await page.getByTestId('practice').click();
 await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().setPaused(true));
 const hud=page.locator('#bot-debug-hud');await hud.locator('div>button').nth(8).click();
 await page.evaluate(async()=>{
  const territoryPath='/src/shared/territory.ts';const {neutralizeTerritory,setOwner,clearTrail}=await import(territoryPath);
  const api=(window as any).__HEXHOLD_TEST__,p=api.getPractice(),m=p.match,[a,b,c]=[8,2,3].map(slot=>m.participants.find((q:any)=>q.slot===slot)),id=(q:number,r=0)=>m.map.byKey.get(q+','+r);
  for(const [v,q]of [[a,0],[b,5],[c,-5]]){neutralizeTerritory(m,v);clearTrail(m,v);v.cellId=id(q);v.position={...m.map.cells[v.cellId].center};setOwner(m,v.cellId,v.slot+1);v.protectedUntilTick=0;v.spawnCells.clear();}
  setOwner(m,id(1),c.slot+1);setOwner(m,id(1,-1),c.slot+1);
  const memory=p.memories.get(a.participantId);memory.emotion.damage.regions.clear();memory.emotion.damage.regions.set(id(1),{attackerId:b.participantId,tick:m.tick});
  p.botDebug.reclaim.decision(a.participantId,{tick:m.tick,from:'EXPAND',to:'EXPAND',ownTrail:0,attackTarget:null,attacks:[],planChanged:true,reason:'EXPANSION_SCORE',expansionPath:[id(1),id(1,-1),id(0,-1),id(0)],expansionPlan:{shape:'RHOMBUS',pathLength:4,externalLength:3,captureSize:3,stolenCells:2,earlyClosed:false,response:{reclaimRaw:.5,bonus:.5}}});api.showPracticeView();
 });
 await expect(hud.locator('pre')).toContainText('예상 되찾기 1칸 → 실제 0칸');
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().botDebugOverlayState())).toMatchObject({enabled:true,damage:1,expected:1,actual:0});
 await page.evaluate(async()=>{
  const territoryPath='/src/shared/territory.ts',enginePath='/src/shared/engine.ts';const [{addTrail},{applySimultaneousCaptures}]=await Promise.all([import(territoryPath),import(enginePath)]);
  const api=(window as any).__HEXHOLD_TEST__,p=api.getPractice(),m=p.match,a=m.participants.find((q:any)=>q.slot===8),id=(q:number,r=0)=>m.map.byKey.get(q+','+r);
  for(const cell of [id(1),id(1,-1),id(0,-1)])addTrail(m,a,cell);applySimultaneousCaptures(m,[a]);p.botDebug.afterTick();api.showPracticeView();
 });
 await expect(hud.locator('pre')).toContainText('예상 되찾기 1칸 → 실제 1칸');await expect(hud.locator('pre')).toContainText('일반 탈취 1칸 / 중립 1칸');
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().botDebugOverlayState())).toMatchObject({enabled:true,actual:1});
 await hud.getByRole('button',{name:'선택 봇 따라보기',exact:true}).click();
 await hud.evaluate(el=>{el.scrollTop=el.querySelector('pre')!.offsetTop-12;});
 await page.screenshot({path:'.local/bot-reclaim/recovery-overlay.png'});
 await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().botDebugOverlayState().enabled)).toBe(false);expect(errors).toEqual([]);
});

test('reposition shows an orange owned route, actual arrival and a fresh recovery plan, and clears on exit',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&spectate=1&experimentSeed=73');await page.getByTestId('nickname').fill('검증');await page.getByTestId('practice').click();
 const selected=await page.evaluate(async()=>{
  const api=(window as any).__HEXHOLD_TEST__,practice=api.getPractice();practice.setPaused(true);const m=practice.match,a=m.participants[12],b=m.participants[10];
  const territory=await import('/src/shared/territory.ts' as string),bot=await import('/src/shared/bot.ts' as string),director=await import('/src/shared/bot-director.ts' as string),game=await import('/src/shared/game.ts' as string);
  const id=(q:number,r=0)=>m.map.byKey.get(q+','+r),memory=practice.memories.get(a.participantId);
  for(const p of m.participants){territory.clearTrail(m,p);territory.neutralizeTerritory(m,p);p.lifeState='DEAD_WAIT';p.respawnAtTick=Infinity;}
  for(const [p,q]of [[a,0],[b,25]] as const){p.lifeState='ALIVE';p.cellId=id(q);p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};p.targetDirection=null;territory.setOwner(m,p.cellId,p.slot+1);}
  for(let q=0;q<=14;q++)for(let r=-2;r<=2;r++)territory.setOwner(m,id(q,r),a.slot+1);
  memory.path=[];memory.goal='EXPAND';memory.expansion=undefined;memory.nextDecisionTick=0;memory.lastProgressTick=m.tick;memory.plannedLifeId=a.lifeId;memory.attackSlot=null;memory.attackTarget=null;
  memory.emotion.damage.regions.clear();memory.emotion.damage.recent.clear();memory.emotion.lifeId=a.lifeId;memory.emotion.matchId=m.matchId;memory.emotion.grudge.set(b.participantId,{amount:12,tick:m.tick});
  for(const q of [17,18])for(const r of [-1,0,1]){territory.setOwner(m,id(q,r),b.slot+1);memory.emotion.damage.regions.set(id(q,r),{attackerId:b.participantId,tick:m.tick});}
  memory.emotion.damage.recent.set(b.participantId,[{tick:m.tick,cells:6,observedCells:0}]);
  const advance=()=>{game.stepMatch(m,director.getBotInputs(m,practice.memories,new Set([a.participantId])));practice.botDebug.afterTick();practice.publish(game.buildView(m),null);};advance();
  (window as any).__REPOSITION_FIXTURE__={practice,a,memory,advance};return a.participantId;
 });
 const hud=page.locator('#bot-debug-hud');await hud.locator('div>button').filter({hasText:'#12 호두과자'}).click();
 await expect(hud.locator('pre')).toContainText('REPOSITION → cell');await expect(hud.locator('pre')).toContainText('주황 = 재배치');
 const state=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().botDebugOverlayState());expect(state.route).toBeGreaterThan(10);expect(state.destination).not.toBeNull();
 await hud.getByRole('button',{name:'선택 봇 따라보기',exact:true}).click();await hud.evaluate(el=>el.scrollTop=el.querySelector('pre')!.offsetTop-12);await page.screenshot({path:'.local/bot-reposition/route.png'});
 const result=await page.evaluate(()=>{const {practice,a,memory,advance}=(window as any).__REPOSITION_FIXTURE__;for(let i=0;i<300&&memory.reposition.active;i++)advance();return {last:memory.reposition.last,goal:memory.goal,trail:a.trailCells.size,bots:practice.botDiagnostics().bots};});
 expect(result.last.outcome).toBe('ARRIVED');expect(result.last.movedCells).toBeGreaterThanOrEqual(11);await expect(hud.locator('pre')).toContainText('ARRIVED');
 expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().botDebugOverlayState().route)).toBe(0);
 await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await expect(page.getByTestId('practice')).toBeVisible();expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().botDebugOverlayState().enabled)).toBe(false);expect(errors).toEqual([]);expect(selected).toBeTruthy();
});

test('departure HUD separates first-trail safety from danger and counts actual blocked attempts',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&spectate=1&experimentSeed=137');await page.getByTestId('nickname').fill('출발 확인');await page.getByTestId('practice').click();
 await page.evaluate(async()=>{const api=(window as any).__HEXHOLD_TEST__,p=api.getPractice();p.setPaused(true);const m=p.match,a=m.participants[7],b=m.participants[9];
  const territory=await import('/src/shared/territory.ts' as string),director=await import('/src/shared/bot-director.ts' as string),game=await import('/src/shared/game.ts' as string),id=(q:number,r=0)=>m.map.byKey.get(q+','+r);
  for(const other of m.participants){territory.clearTrail(m,other);territory.neutralizeTerritory(m,other);other.lifeState='DEAD_WAIT';other.respawnAtTick=Infinity;}
  for(const [actor,q]of [[a,0],[b,4]] as const){actor.lifeState='ALIVE';actor.cellId=id(q);actor.position={...m.map.cells[actor.cellId].center};actor.direction={x:actor===a?1:-1,y:0};actor.targetDirection=null;}
  for(let q=-6;q<=0;q++)for(let r=-4;r<=4;r++)territory.setOwner(m,id(q,r),a.slot+1);
  const memory=p.memories.get(a.participantId);memory.plannedLifeId=a.lifeId;memory.path=[id(1),id(2),id(2,-1),id(1,-1),id(0)];memory.goal='STEAL';memory.nextDecisionTick=m.tick+6;memory.departureOwned=false;
  memory.emotion.damage.regions.set(id(1),{attackerId:b.participantId,tick:m.tick});p.botDebug.reclaim.decision(a.participantId,{tick:m.tick,from:'EXPAND',to:'STEAL',ownTrail:0,attackTarget:null,attacks:[],planChanged:true,expansionPlan:{shape:'RHOMBUS',pathLength:5,externalLength:4,captureSize:4,stolenCells:1,earlyClosed:false},expansionPath:[...memory.path]});
  director.getBotInputs(m,p.memories);p.publish(game.buildView(m),null);api.showPracticeView();
 });
 const hud=page.locator('#bot-debug-hud');await hud.locator('div>button').nth(7).click();await expect(hud.locator('pre')).toContainText('LAUNCH_BLOCKED');await expect(hud.locator('pre')).toContainText('PREDICTED_OVERLAP #9');await expect(hud.locator('pre')).toContainText('사전 필터 7칸');await expect(hud.locator('pre')).toContainText('봇 생존 분당');
 const row=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().botDiagnostics().bots.find((b:any)=>b.slot===7));expect(row.trailLength).toBe(0);expect(row.goal).toBe('RETURN');expect(row.departure.blocks).toBeGreaterThanOrEqual(1);expect(row.planTrace.expansionPlan).toBeUndefined();expect(row.reclaim.active).toBeNull();expect(row.reclaim.recent.at(-1).outcome).toBe('LAUNCH_BLOCKED');expect(await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getScene().botDebugOverlayState().expected)).toBe(0);expect(errors).toEqual([]);
});

test('reposition HUD reports a physically rejected start without creating an episode',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto('/?debug=1&spectate=1&experimentSeed=137');await page.getByTestId('nickname').fill('검증');await page.getByTestId('practice').click();
 const selected=await page.evaluate(async()=>{
  const api=(window as any).__HEXHOLD_TEST__,practice=api.getPractice();practice.setPaused(true);const m=practice.match,a=m.participants[7],b=m.participants[10];
  const territory=await import('/src/shared/territory.ts' as string),bot=await import('/src/shared/bot.ts' as string),director=await import('/src/shared/bot-director.ts' as string),game=await import('/src/shared/game.ts' as string);
  const id=(q:number,r=0)=>m.map.byKey.get(q+','+r),memory=practice.memories.get(a.participantId);
  for(const p of m.participants){territory.clearTrail(m,p);territory.neutralizeTerritory(m,p);p.lifeState='DEAD_WAIT';p.respawnAtTick=Infinity;}
  for(const [p,q]of [[a,0],[b,25]] as const){p.lifeState='ALIVE';p.cellId=id(q);p.position={...m.map.cells[p.cellId].center};p.direction={x:p===a?-1:1,y:0};p.targetDirection=null;territory.setOwner(m,p.cellId,p.slot+1);}
  for(let q=0;q<=14;q++)for(let r=0;r<=0;r++)territory.setOwner(m,id(q,r),a.slot+1);
  memory.path=[];memory.goal='EXPAND';memory.expansion=undefined;memory.nextDecisionTick=0;memory.lastProgressTick=m.tick;memory.plannedLifeId=a.lifeId;memory.attackSlot=null;memory.attackTarget=null;
  memory.emotion.damage.regions.clear();memory.emotion.damage.recent.clear();memory.emotion.lifeId=a.lifeId;memory.emotion.matchId=m.matchId;memory.emotion.grudge.set(b.participantId,{amount:12,tick:m.tick});
  for(const q of [17,18])for(const r of [-1,0,1]){territory.setOwner(m,id(q,r),b.slot+1);memory.emotion.damage.regions.set(id(q,r),{attackerId:b.participantId,tick:m.tick});}
  memory.emotion.damage.recent.set(b.participantId,[{tick:m.tick,cells:6,observedCells:0}]);
  const advance=()=>{game.stepMatch(m,director.getBotInputs(m,practice.memories,new Set([a.participantId])));practice.botDebug.afterTick();practice.publish(game.buildView(m),null);};advance();
  (window as any).__REPOSITION_FIXTURE__={practice,a,memory,advance};return a.participantId;
 });
 const hud=page.locator('#bot-debug-hud');await hud.locator('div>button').nth(7).click();await expect(hud.locator('pre')).toContainText('PHYSICAL_START_UNSAFE');await expect(hud.locator('pre')).toContainText('재배치 시작 조향 검사');await expect(hud.locator('pre')).toContainText('LEAVES_HOME');
 const row=await page.evaluate(()=>(window as any).__HEXHOLD_TEST__.getPractice().botDiagnostics().bots.find((b:any)=>b.slot===7));expect(row.reposition.active).toBeNull();expect(row.reposition.sequence).toBe(0);expect(row.reposition.cooldownUntil).toBe(0);expect(row.reposition.selection.startRejected).toBeGreaterThan(0);expect(row.reposition.stats.starts).toBe(0);expect(row.reposition.stats.aborts).toBe(0);expect(row.reposition.stats.unsafeSelections).toBe(1);expect(errors).toEqual([]);expect(selected).toBeTruthy();
});

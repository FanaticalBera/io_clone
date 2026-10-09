import {test,expect} from '@playwright/test';
for(const mode of ['baseline','territory-safe','default'])test(`Practice ${mode}: death-only rule and blocked/retry recovery`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto(mode==='default'?'/?experimentSeed=1':`/?respawnMode=${mode}&experimentSeed=1`);await page.getByTestId('nickname').fill('Respawn');await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();
 const result=await page.evaluate(async()=>{
  const api=(window as any).__HEXHOLD_TEST__,practice=api.getPractice();practice.setPaused(true);const m=practice.match,h=m.participants[0],p=m.participants[13];
  const load=(path:string)=>new Function('path','return import(path)')(path);
  const {markDead}=await load('/src/shared/life.ts'),{setOwner}=await load('/src/shared/territory.ts'),{region}=await load('/src/shared/hex.ts'),{tryRespawns,inspectSpawnSpace}=await load('/src/shared/spawn.ts');
  const initial={participants:m.participants.length,bots:m.participants.filter((q:any)=>q.kind==='BOT').length,cells:m.map.cells.length,spawnCells:p.spawnCells.size,respawn:m.config.respawnSeconds,retry:m.config.retrySpawnSeconds,mode:m.gameMode.id};
  markDead(m,p,'TRAIL_CUT');const due=p.respawnAtTick;for(const q of m.participants)if(q!==h&&q!==p)q.lifeState='FINISHED';
  for(const c of m.map.cells)setOwner(m,c.id,h.slot+1);const center=m.map.byKey.get('0,0');for(const id of region(m.map,center,3))setOwner(m,id,0);
  h.cellId=m.map.byKey.get('20,0');h.position={...m.map.cells[h.cellId].center};m.tick=due-1;tryRespawns(m);const before=p.lifeState;
  m.tick=due;tryRespawns(m);const first={state:p.lifeState,cells:p.spawnCells.size,retryTick:p.respawnAtTick,valid:inspectSpawnSpace(m,p).validCenterCount};
  let recovered=null;
  if(p.lifeState==='SPAWN_BLOCKED'){
   for(const id of region(m.map,center,4))setOwner(m,id,0);m.tick=due+29;tryRespawns(m);const waiting=p.lifeState;m.tick=due+30;tryRespawns(m);
   recovered={waiting,state:p.lifeState,cells:p.spawnCells.size,center:p.cellId,expectedCenter:center};
  }
  api.showPracticeView();return {initial,before,first,recovered,due};
 });
 expect(result.initial).toEqual({participants:14,bots:13,cells:9577,spawnCells:7,respawn:3,retry:1,mode:'classic'});expect(result.before).toBe('DEAD_WAIT');
 if(mode!=='baseline'){expect(result.first).toMatchObject({state:'SPAWN_BLOCKED',retryTick:result.due+30,valid:0});expect(result.recovered).toMatchObject({waiting:'SPAWN_BLOCKED',state:'ALIVE',cells:7});expect(result.recovered!.center).toBe(result.recovered!.expectedCenter);}
 else{expect(result.first).toMatchObject({state:'ALIVE',cells:7});expect(result.recovered).toBeNull();}
 await page.screenshot({path:`.local/safe-respawn-${mode}.png`});expect(errors).toEqual([]);
});
for(const mode of ['baseline','invalid'])test(`Production ignores the development override respawnMode=${mode}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 await page.goto(`http://127.0.0.1:5311/?respawnMode=${mode}&experimentSeed=1`);await page.getByTestId('nickname').fill('Production');await page.getByTestId('practice').click();
 await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#score-detail')).toContainText('/ 9577칸');await expect(page.locator('#field')).toHaveAttribute('data-avatars','14');
 expect(await page.evaluate(()=>('__HEXHOLD_TEST__' in window))).toBe(false);expect(errors).toEqual([]);
});

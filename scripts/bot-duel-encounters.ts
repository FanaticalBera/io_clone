import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Desktop-only encounter audit. Nothing in the client imports this runner.
const arg=(name:string,fallback:string)=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const source=resolve(arg('source','.')),out=resolve(arg('out','.local/bot-duel-20261015/current'));
const seeds=arg('seeds','4,19,73,137').split(',').map(Number),ticks=Number(arg('ticks','900'));
const radii=arg('radii','24').split(',').map(Number),arm=arg('arm','baseline');
const observe=arg('observe','on')==='on';
const load=(name:string)=>import(pathToFileURL(resolve(source,'src/shared',name+'.ts')).href);
const [game,bot,identity,director,hex,movement,territory]=await Promise.all(['game','bot','bot-identity','bot-director','hex','movement','territory'].map(load));
const experiment=arm==='baseline'?null:await load('bot-encounter-experiment');
const roles=arg('roles','EXPAND,ATTACK,DEFEND,SEEK_POINT').split(',');
const scenes=arg('scenes','contact-patrol,neutral-gap-patrol,contact-tight-patrol,neutral-gap-tight-patrol,exposed-loop').split(',');
const navigation=await load('bot-navigation');
const increment=(map:Record<string,number>,key:string)=>map[key]=(map[key]??0)+1;
const serialize=(v:unknown)=>JSON.stringify(v,(_k,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);
const results:any[]=[];
mkdirSync(out,{recursive:true});

for(const radius of radii)for(const seed of seeds)for(const role of roles)for(const scene of scenes){
 const m=game.createMatch({mapRadius:radius,maxSlots:4},seed,[
  {participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},
  {participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality:role}
 ],'duel-'+radius+'-'+seed+'-'+role+'-'+scene);
 const [human,self]=m.participants,id=(q:number,r=0)=>{const cell=m.map.byKey.get(q+','+r);assert.notEqual(cell,undefined);return cell;};
 m.owners.fill(0);m.trailMasks.fill(0);
 for(const p of m.participants){p.territoryCount=0;p.trailCells.clear();p.trailOriginCellId=null;p.spawnCells.clear();p.protectedUntilTick=0;}
 const gap=scene.startsWith('neutral-gap')?2:0,humanEdge=1+gap;
 for(const c of m.map.cells){
  if(c.q>=-10&&c.q<=0&&Math.abs(c.r)<=8)territory.setOwner(m,c.id,2);
  if(c.q>=humanEdge&&c.q<=humanEdge+9&&Math.abs(c.r)<=8)territory.setOwner(m,c.id,1);
 }
 self.cellId=id(0);self.position={...m.map.cells[self.cellId].center};self.direction={x:1,y:0};self.targetDirection=null;
 human.cellId=id(humanEdge+1);human.position={...m.map.cells[human.cellId].center};human.direction={x:0,y:1};human.targetDirection=null;
 for(const p of m.participants){p.spawnCells.add(p.cellId);if(p.run)p.run.bestTerritoryCells=p.territoryCount;}
 territory.assertOwnershipCounts(m);
 const memorySeed=identity.botSeed(seed,self.slot),memory=bot.createBotMemory(memorySeed,'combined',identity.createBotIdentity(memorySeed,role));
 if(experiment)experiment.setBotEncounterExperiment(memory,arm);
 const memories=new Map([['bot',memory]]),hash=createHash('sha256');
 const stats:any={radius,seed,role,scene,arm,ticks:0,nearTicks:0,nearTrailTicks:0,nearReadableTrailTicks:0,exposedTicks:0,maxTrail:0,
  attackTicks:0,nearHomeTicks:0,pursuitTicks:0,chosenPlans:0,chosenSmallPlans:0,chosenLongerPlans:0,nearChosenPlans:0,nearChosenSmallPlans:0,nearChosenLongerPlans:0,
  candidateExternalHistogram:{},nearCandidateExternalHistogram:{},rejected:{},decisions:{},captures:[],excursions:[],deaths:[]};
 const stops:(()=>void)[]=[],witnesses:any[]=[];
 if(observe){
  stops.push(bot.watchBotDecisions(memory,(t:any)=>{
   increment(stats.decisions,t.reason??'UNKNOWN');
   for(const [reason,count]of Object.entries(t.expansionRejected??{}))stats.rejected[reason]=(stats.rejected[reason]??0)+(count as number);
  if(t.expansionPlan&&t.reason==='EXPANSION_SCORE'){
    const length=t.expansionPlan.externalLength,near=hex.hexDistance(m.map.cells[self.cellId],m.map.cells[human.cellId])<=6;
    stats.chosenPlans++;stats.chosenSmallPlans+=Number(length<=3);stats.chosenLongerPlans+=Number(length>=5);
    if(near){stats.nearChosenPlans++;stats.nearChosenSmallPlans+=Number(length<=3);stats.nearChosenLongerPlans+=Number(length>=5);}
    if(witnesses.length<12)witnesses.push({tick:m.tick,near,reason:t.reason,external:length,captureSize:t.expansionPlan.captureSize,goal:t.to});
   }
  },{shadow:false}));
  stops.push((await load('bot-candidate-diagnostics')).watchBotCandidates(memory,(o:any,batch:any)=>{
   if(batch.kind!=='STRATEGY')return;
   const near=o.others.some((p:any)=>hex.hexDistance(o.map.cells[p.cellId],o.map.cells[o.self.cellId])<=6);
   for(const c of batch.candidates)if(c.expansion){increment(stats.candidateExternalHistogram,String(c.expansion.externalLength));if(near)increment(stats.nearCandidateExternalHistogram,String(c.expansion.externalLength));}
  }));
 }
 const route=scene==='exposed-loop'?[[humanEdge+1,3],[-3,3],[-3,-3],[humanEdge+1,-3]]:
  scene.includes('tight')?[[humanEdge+2,1],[humanEdge+2,-1]]:[[humanEdge+1,3],[humanEdge+1,-3]];
 let waypoint=0,seq=0,episode:any=null;
 for(let tick=0;tick<ticks&&m.phase==='RUNNING'&&self.lifeId===1&&human.lifeId===1&&self.lifeState==='ALIVE'&&human.lifeState==='ALIVE';tick++){
  let target=m.map.cells[id(...route[waypoint] as [number,number])].center;
  if(Math.hypot(target.x-human.position.x,target.y-human.position.y)<18){waypoint=(waypoint+1)%route.length;target=m.map.cells[id(...route[waypoint] as [number,number])].center;}
  // Optional synthetic pursuit: only a currently visible trail within six cells,
  // with ordinary steering/collision and no access to the bot's plan or intent.
  // This is a reproducible interception attempt, not a human playtest.
  if(scene.endsWith('intercept')){
   const visible=[...self.trailCells].filter(cell=>hex.hexDistance(m.map.cells[human.cellId],m.map.cells[cell as number])<=6)
    .sort((a:any,b:any)=>Math.hypot(m.map.cells[a].center.x-human.position.x,m.map.cells[a].center.y-human.position.y)-Math.hypot(m.map.cells[b].center.x-human.position.x,m.map.cells[b].center.y-human.position.y)||(a-b));
   for(const cell of visible){const path=navigation.shortestPath(m.map,human.cellId,(id:number)=>id===cell,(id:number)=>!human.trailCells.has(id)||id===cell,6);
    if(path){target=m.map.cells[path[0]??cell as number].center;stats.pursuitTicks++;break;}}
  }
  const d=movement.normalizeDirection(target.x-human.position.x,target.y-human.position.y)??human.direction;
  const inputs=director.getBotInputs(m,memories);
  inputs.set('human',{matchId:m.matchId,lifeId:human.lifeId,seq:++seq,dx:d.x,dy:d.y});
  const before=m.eventCounter;hash.update(serialize([...inputs]));game.stepMatch(m,inputs);
  hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer));hash.update(serialize(m.participants.map((p:any)=>[p.lifeId,p.lifeState,p.position,p.direction,p.lastAppliedInputSeq])));
  const near=hex.hexDistance(m.map.cells[self.cellId],m.map.cells[human.cellId])<=6;
  stats.ticks++;stats.nearTicks+=Number(near);stats.exposedTicks+=Number(self.trailCells.size>0);stats.nearTrailTicks+=Number(near&&self.trailCells.size>0);
  stats.nearHomeTicks+=Number(near&&self.lifeState==='ALIVE'&&!self.trailCells.size&&m.owners[self.cellId]===self.slot+1);
  // Operational opportunity proxy only, not a guaranteed reachable kill.
  stats.nearReadableTrailTicks+=Number(self.lifeState==='ALIVE'&&human.lifeState==='ALIVE'&&self.trailCells.size>=4&&[...self.trailCells].some((cell:any)=>hex.hexDistance(m.map.cells[cell],m.map.cells[human.cellId])<=6));
  stats.maxTrail=Math.max(stats.maxTrail,self.trailCells.size);stats.attackTicks+=Number(memory.goal==='ATTACK');
  if(self.trailCells.size&&!episode)episode={start:m.tick,max:0,ticks:0,nearTicks:0};
  if(episode){episode.max=Math.max(episode.max,self.trailCells.size);episode.ticks++;episode.nearTicks+=Number(near);}
  const events=m.events.filter((e:any)=>Number(e.eventId.split(':').at(-1))>before);
  for(const e of events){if(e.type==='CAPTURE'&&e.participantId==='bot')stats.captures.push({tick:m.tick,amount:e.amount,near});if(e.type==='DEATH')stats.deaths.push({participantId:e.participantId,tick:m.tick,cause:e.deathContext?.cause??e.reason,killerId:e.killerId});}
  if(episode&&(!self.trailCells.size||self.lifeState!=='ALIVE')){stats.excursions.push({...episode,end:m.tick,ended:self.lifeState==='ALIVE'?'RETURN':'DEATH'});episode=null;}
 }
 for(const stop of stops)stop();
 if(episode)stats.excursions.push({...episode,end:m.tick,ended:'CENSORED'});
 territory.assertOwnershipCounts(m);
 stats.end={bot:self.lifeState,human:human.lifeState,botCells:self.territoryCount,humanCells:human.territoryCount,botKills:self.kills};
 stats.proof={trajectory:hash.digest('hex'),memory:createHash('sha256').update(serialize(memory)).digest('hex'),nextRng:memory.random(),director:director.botDirector(m).snapshot()};
 stats.witnesses=witnesses;results.push(stats);
}
const summary=roles.map(role=>{const rows=results.filter(r=>r.role===role),sum=(key:string)=>rows.reduce((n,r)=>n+r[key],0);return {role,cases:rows.length,ticks:sum('ticks'),nearTicks:sum('nearTicks'),nearTrailTicks:sum('nearTrailTicks'),readableTrailTicks:sum('nearReadableTrailTicks'),nearChosenPlans:sum('nearChosenPlans'),nearSmallPlans:sum('nearChosenSmallPlans'),nearLongerPlans:sum('nearChosenLongerPlans'),botDeaths:rows.reduce((n,r)=>n+r.deaths.filter((d:any)=>d.participantId==='bot').length,0),humanDeaths:rows.reduce((n,r)=>n+r.deaths.filter((d:any)=>d.participantId==='human').length,0)};});
const sourceHashes=Object.fromEntries(['bot-strategy.ts','bot-tactical.ts','bot-immediate-safety.ts','bot.ts','config.ts','home-return-margin.ts'].map(f=>[f,createHash('sha256').update(readFileSync(resolve(source,'src/shared',f))).digest('hex')]));
writeFileSync(resolve(out,'results.json'),JSON.stringify({protocol:{source,sourceHashes,arm,observe,seeds,radii,ticks,scenes,roles,stop:'first death of either participant or time limit',opportunity:'alive bot trail >=4 cells and some trail within 6 cells of alive human; proxy, not proven cut ETA'},summary,results},null,2)+'\n');
console.log(JSON.stringify({out,arm,observe,summary}));

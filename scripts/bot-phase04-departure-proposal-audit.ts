// Proposal evidence only: replay the immutable first-regression source unchanged.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const option=(name:string,fallback:string)=>process.argv.find(a=>a.startsWith(name))?.slice(name.length)??fallback;
const raw=resolve(option('--history=','../bot-phase04-medium-history'));
const out=resolve(option('--out=','../bot-phase04-departure-proposal'));
if(existsSync(out))throw Error('Preserve existing evidence: choose a new output directory');
mkdirSync(out,{recursive:true});
const history=JSON.parse(readFileSync(resolve(raw,'history.json'),'utf8'));
const source=resolve(raw,'6c307e3/source'),row=history.rows.find((v:any)=>v.short==='6c307e3');
for(const [name,expected] of Object.entries(row.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(resolve(source,name))).digest('hex'),expected);
const original=JSON.parse(readFileSync(resolve(raw,'first-break-frames.json'),'utf8'));
const load=(name:string)=>import(pathToFileURL(resolve(source,'src/shared',name+'.ts')).href);
const [game,ai,identity,director,hex,movement,safety]=await Promise.all(['game','bot','bot-identity','bot-director','hex','movement','bot-immediate-safety'].map(load));
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function replay(reference:any,probe:boolean){
 const personality=reference.personality,route=reference.route;
 const match=game.createMatch({mapRadius:22,maxSlots:8,spawnRadius:2},115,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality}]);
 const [human,bot]=match.participants,origin=match.map.cells[human.cellId],memory=ai.createBotMemory(7,'combined',identity.createBotIdentity(7,personality));
 const memories=new Map([[bot.participantId,memory]]),frames:any[]=[],windows:any[]=[],events:any[]=[];
 let index=0,seq=0,lastTrace:any;
 ai.watchBotDecisions(memory,(trace:any)=>{lastTrace=trace;});
 if(probe)safety.watchDepartureSafety(memory,(event:any)=>{if(match.tick>=4&&match.tick<=10)events.push(structuredClone(event));});
 while(match.tick<500&&human.lifeId===1&&human.lifeState==='ALIVE'&&index<route.length){
  const [q,r]=route[index],target=hex.axialToWorld(origin.q+q,origin.r+r,match.map.side);
  if(Math.hypot(target.x-human.position.x,target.y-human.position.y)<18){index++;continue;}
  const d=movement.normalizeDirection(target.x-human.position.x,target.y-human.position.y),inputs=new Map();
  inputs.set(human.participantId,{matchId:match.matchId,lifeId:human.lifeId,seq:++seq,dx:d.x,dy:d.y});
  const frame={tick:match.tick,human:{cell:human.cellId,position:{...human.position},direction:{...human.direction},trail:[...human.trailCells]},bot:{cell:bot.cellId,position:{...bot.position},direction:{...bot.direction},trail:[...bot.trailCells]},goal:memory.goal,path:[...memory.path]};
  let detail:any;
  if(probe&&match.tick>=4&&match.tick<=10){
   // Full public observation for evidence; it is not supplied to the native director.
   const obs=ai.observeBot(match,bot.participantId),owner=bot.slot+1;
   const boundary=match.map.cells.filter((c:any)=>match.owners[c.id]===owner&&c.neighbors.some((n:number)=>n>=0&&match.owners[n]!==owner)).map((c:any)=>c.id);
   const firstCell=700,anchor=boundary.filter((id:number)=>match.map.cells[firstCell].neighbors.includes(id));
   const cellInfo=(id:number)=>({cell:id,q:match.map.cells[id].q,r:match.map.cells[id].r,owner:match.owners[id],boundary:boundary.includes(id),nearestBoundaryDistance:Math.min(...boundary.map((b:number)=>hex.hexDistance(match.map.cells[id],match.map.cells[b]))),originalBoundaryAnchorDistance:Math.min(...anchor.map((a:number)=>hex.hexDistance(match.map.cells[id],match.map.cells[a])))});
   let fallbackProjection:any;
   if(match.tick===4){
    const actor={...obs.self,position:{...obs.self.position},direction:{...obs.self.direction}},local={...obs,self:actor},path=[744],visits=new Set<number>([actor.cellId]);
    for(let n=0;n<30;n++){
     const intent=safety.departureIntent(local,path,'RETURN',true),next=movement.stepSteering(obs.map,actor.position,actor.cellId,actor.direction,intent,obs.config);
     for(const entry of next.entries)visits.add(entry.cellId);visits.add(next.cellId);
     if(next.blocked)break;actor.position=next.position;actor.direction=next.direction;actor.cellId=next.cellId;
    }
    const cells=[...visits].map(cellInfo);
    fallbackProjection={seconds:1,cells,maxOriginalBoundaryAnchorDistance:Math.max(...cells.map(c=>c.originalBoundaryAnchorDistance)),allOwned:cells.every(c=>c.owner===owner)};
   }
   detail={tick:match.tick,decisionDue:match.tick>=memory.nextDecisionTick,nextDecisionTickBefore:memory.nextDecisionTick,actualHumanTrailCells:[...human.trailCells],observedHumanTrailCells:obs.trails.filter((t:any)=>t.slot===human.slot).map((t:any)=>t.cellId),goalBefore:memory.goal,pathBefore:[...memory.path],boundary,originalFirstExteriorCell:firstCell,originalBoundaryAnchors:anchor,actor:cellInfo(bot.cellId),fallbackCell744:cellInfo(744),fallbackProjection,eventsStart:events.length};
  }
  lastTrace=undefined;
  const input=director.getBotInputs(match,memories).get(bot.participantId);if(input)inputs.set(bot.participantId,input);
  const completed={...frame,input,selectedGoal:memory.goal,selectedPath:[...memory.path],trace:lastTrace?structuredClone(lastTrace):null};frames.push(completed);
  if(detail){const {eventsStart,...rest}=detail;windows.push({...rest,nextDecisionTickAfter:memory.nextDecisionTick,goalAfter:memory.goal,pathAfter:[...memory.path],candidateEvaluationOccurred:detail.decisionDue,recordedCandidates:completed.trace?.attacks??[],reason:completed.trace?.reason??null,events:events.slice(eventsStart)});}
  game.stepMatch(match,inputs);
 }
 return {frames,windows,director:director.botDirector(match).snapshot(),memory:JSON.parse(JSON.stringify(memory)),nextActionRng:memory.random(),endTick:match.tick};
}
const cases=[];
for(const id of [5,6,13,14]){
 const reference=original[id-1],control=replay(reference,false),probe=replay(reference,true);
 // The historical evidence is JSON: undefined keys and signed zero normalize there.
 assert.equal(JSON.stringify(control.frames),JSON.stringify(reference.frames));assert.deepEqual(probe.frames,control.frames);
 assert.deepEqual(probe.director,control.director);assert.deepEqual(probe.memory,control.memory);assert.equal(probe.nextActionRng,control.nextActionRng);
 assert.equal(probe.windows.length,7);assert(probe.windows.every(v=>v.actualHumanTrailCells.length===0&&v.observedHumanTrailCells.length===0&&v.recordedCandidates.length===0));
 cases.push({id,personality:reference.personality,route:id<=6?id-4:id-12,windows:probe.windows,allRecordedBlockTicks:probe.frames.filter(v=>v.trace?.departure?.blocked).map(v=>v.tick),
  firstActualExposedTrailTick:probe.frames.find(v=>v.human.trail.length)?.tick,
  firstRecordedAttackCandidate:probe.frames.find(v=>v.trace?.attacks.length)?{tick:probe.frames.find(v=>v.trace?.attacks.length).tick,candidates:probe.frames.find(v=>v.trace?.attacks.length).trace.attacks}:null,
  equivalence:{originalFrames:true,probeFrames:true,director:true,memory:true,nextActionRng:true,frameHash:digest(control.frames),memoryHash:digest(control.memory)}});
 writeFileSync(resolve(out,'case-'+id+'-replay.json'),JSON.stringify(probe,null,2));
}
const summary={commit:row.sha,sourceManifestHash:digest(row.sourceHashes),protocol:history.protocol,window:{start:4,end:10,caseTicks:28},cases,
 conclusion:'No human exposed trail in t4..t10; no candidate rejection. t4 is a light tick; fallback is owned neighbour 744. A new expansion is selected at t7. No proposed behavior has been implemented.'};
writeFileSync(resolve(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({cases:cases.map(v=>({id:v.id,t4:v.windows[0],firstTrail:v.firstActualExposedTrailTick,firstCandidates:v.firstRecordedAttackCandidate})),equivalence:true}));

import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)??'../bot-expanded-attack-baseline'),protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const load=(name:string)=>import(pathToFileURL(resolve(protocol.source,'src/shared',name+'.ts')).href);
const [game,bot,identity,director,hex,movement]=await Promise.all(['game','bot','bot-identity','bot-director','hex','movement'].map(load));
for(const [file,hash] of Object.entries(protocol.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(resolve(protocol.source,'src/shared',file))).digest('hex'),hash);
const create=(seed:number,personality:string)=>game.createMatch({mapRadius:22,maxSlots:8,spawnRadius:2},seed,[{participantId:'human',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'bot',slot:1,nickname:'B',kind:'BOT',personality}]);
const preflight=[];
for(const layout of protocol.axes.layouts)for(let i=0;i<4;i++){
 const match=create(layout.minimumMatchSeed,'ATTACK'),human=match.participants[0],origin=match.map.cells[human.cellId],route=protocol.axes.routes[i];
 let position={...human.position},heading={...human.direction},cell=human.cellId,index=0,tick=0,blocked=false;
 while(tick<500&&index<route.length){const [q,r]=route[index],target=hex.axialToWorld(origin.q+q,origin.r+r,match.map.side);if(Math.hypot(target.x-position.x,target.y-position.y)<18){index++;continue;}
  const intent=movement.normalizeDirection(target.x-position.x,target.y-position.y),next=movement.stepSteering(match.map,position,cell,heading,intent,match.config);tick++;
  if(next.blocked){blocked=true;break;}position=next.position;heading=next.direction;cell=next.cellId;
 }
 preflight.push({matchSeed:layout.minimumMatchSeed,route:i+1,ticks:tick,blocked,complete:index===route.length});
}
writeFileSync(resolve(root,'human-physical-preflight.json'),JSON.stringify(preflight,null,2)+'\n');
if(preflight.some(r=>r.blocked||!r.complete))throw Error('Human-only physical preflight incomplete; no attack outcomes run');
const memoryState=(m:any)=>JSON.stringify(m,(_k,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:ArrayBuffer.isView(v)?Array.from(v as Uint8Array):v);
function run(seed:number,memorySeed:number,personality:string,routeIndex:number,observe:boolean){
 const match=create(seed,personality),[human,self]=match.participants,origin=match.map.cells[human.cellId],memory=bot.createBotMemory(memorySeed,'combined',identity.createBotIdentity(memorySeed,personality)),memories=new Map([['bot',memory]]),route=protocol.axes.routes[routeIndex];
 const initialDistance=hex.hexDistance(match.map.cells[human.cellId],match.map.cells[self.cellId]);
 const trajectory=createHash('sha256'),reasons:any={},traces:any[]=[];let index=0,seq=0,maxTrail=0,observedTrailTicks=0,attackTicks=0,attackStarts=0,lastGoal='',lastTrace:any,activeAttackCut=false;
 if(observe)bot.watchBotDecisions(memory,(trace:any)=>{lastTrace=trace;traces.push(structuredClone(trace));for(const a of new Map(trace.attacks.map((a:any)=>[[a.slot,a.target,a.interrupt,a.reason].join(':'),a])).values())reasons[(a as any).reason]=(reasons[(a as any).reason]??0)+1;},{shadow:false});
 while(match.tick<500&&human.lifeId===1&&human.lifeState==='ALIVE'&&index<route.length){
  const [q,r]=route[index],target=hex.axialToWorld(origin.q+q,origin.r+r,match.map.side);if(Math.hypot(target.x-human.position.x,target.y-human.position.y)<18){index++;continue;}
  const d=movement.normalizeDirection(target.x-human.position.x,target.y-human.position.y),inputs=new Map();inputs.set('human',{matchId:match.matchId,lifeId:human.lifeId,seq:++seq,dx:d.x,dy:d.y});
  if(bot.observeBot(match,'bot').trails.some((t:any)=>t.slot===human.slot))observedTrailTicks++;
  lastTrace=undefined;const input=director.getBotInputs(match,memories).get('bot');if(input)inputs.set('bot',input);
  if(memory.goal==='ATTACK'){attackTicks++;if(lastGoal!=='ATTACK')attackStarts++;}lastGoal=memory.goal;
  const activeAttack=memory.goal==='ATTACK'&&memory.attackSlot===human.slot;
  trajectory.update(JSON.stringify([...inputs]));const before=match.eventCounter;game.stepMatch(match,inputs);maxTrail=Math.max(maxTrail,human.trailCells.size);
  trajectory.update(match.owners);trajectory.update(Buffer.from(match.trailMasks.buffer,match.trailMasks.byteOffset,match.trailMasks.byteLength));trajectory.update(JSON.stringify(match.participants.map((p:any)=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));
  const death=match.events.find((e:any)=>Number(e.eventId.split(':').at(-1))>before&&e.type==='DEATH'&&e.participantId===human.participantId);
  if(death)activeAttackCut=activeAttack;
 }
 const death=match.events.find((e:any)=>e.type==='DEATH'&&e.participantId===human.participantId),cause=death?.deathContext?.cause??null,cut=death?.killerId==='bot'&&['EXISTING_TRAIL_CONTACT','PENDING_TRAIL_CONTACT'].includes(cause);
 const result={id:`L${seed}/M${memorySeed}/${personality}/R${routeIndex+1}`,matchSeed:seed,memorySeed,personality,trait:memory.identity.secondaryTrait,route:routeIndex+1,distance:initialDistance,cut:!!cut,activeAttackCut:!!cut&&activeAttackCut,cutTick:cut?death.tick:null,endTick:match.tick,cause,humanState:human.lifeState,botLife:self.lifeId,botDeaths:self.deaths,simultaneousBotDeath:!!cut&&match.events.some((e:any)=>e.type==='DEATH'&&e.participantId==='bot'&&e.tick===death.tick),attackStarts,attackTicks,observedTrailTicks,maxTrail,reasons};
 return {result,proof:{trajectoryHash:trajectory.digest('hex'),memoryHash:createHash('sha256').update(memoryState(memory)).digest('hex'),nextActionRng:memory.random(),director:director.botDirector(match).snapshot()},traces};
}
mkdirSync(resolve(root,'cases'),{recursive:true});const results=[],observerChecks=[];
for(const layout of protocol.axes.layouts){const seed=layout.minimumMatchSeed;
 for(const m of protocol.axes.memorySeeds)for(const personality of protocol.axes.personalities)for(let r=0;r<4;r++){
  const runWith=run(seed,m,personality,r,true);runWith.result.distance=layout.distance;results.push(runWith.result);
  const check=(seed===115&&m===7)||(seed!==115&&m===7&&r===0);
  if(check){const control=run(seed,m,personality,r,false);assert.deepEqual(runWith.proof,control.proof);const {reasons,...a}=runWith.result,{reasons:ignored,...b}=control.result;a.distance=layout.distance;b.distance=layout.distance;assert.deepEqual(a,b);observerChecks.push({id:runWith.result.id,equal:true});}
  writeFileSync(resolve(root,'cases',runWith.result.id.replaceAll('/','-')+'.json'),JSON.stringify(runWith,null,2));
 }
 console.error('Finished expanded layout '+seed);
 writeFileSync(resolve(root,'results.json'),JSON.stringify({protocol:'protocol.json',results,observerChecks},null,2));
}
assert.equal(results.length,1024);assert.equal(observerChecks.length,44);
const legacy=results.filter(r=>r.matchSeed===115&&r.memorySeed===7);assert.equal(legacy.filter(r=>r.cut).length,13);
writeFileSync(resolve(root,'results.json'),JSON.stringify({protocol:'protocol.json',results,observerChecks,legacy16:{cuts:13,failures:legacy.map((r,i)=>r.cut?null:i+1).filter(v=>v!==null)}},null,2)+'\n');

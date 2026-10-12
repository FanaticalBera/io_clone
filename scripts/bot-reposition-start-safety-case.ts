import {getBotInput as currentGetBotInput} from '../src/shared/bot.js';
import {selectReposition as currentSelect} from '../src/shared/bot-reposition.js';
import {evaluateRepositionStartSafety} from '../src/shared/bot-immediate-safety.js';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=resolve(process.argv.find(a=>a.startsWith('--source='))?.slice(9)??'../bot-rp-start-proposal/before');
const load=(name:string)=>import(pathToFileURL(resolve(source,'src/shared',name+'.ts')).href);
const {createMatch,stepMatch}=await load('game') as typeof import('../src/shared/game.js');
const {botSpecs,createBotMemory,getBotInput,observeBot,shortestPath}=await load('bot') as typeof import('../src/shared/bot.js');
const {botSeed,createBotIdentity}=await load('bot-identity') as typeof import('../src/shared/bot-identity.js');
const {getBotInputs}=await load('bot-director') as typeof import('../src/shared/bot-director.js');
const {selectReposition,startReposition}=await load('bot-reposition') as typeof import('../src/shared/bot-reposition.js');
const {projectDeparture}=await load('bot-immediate-safety') as typeof import('../src/shared/bot-immediate-safety.js');
const {setSafeBotRespawn}=await load('safe-bot-respawn') as typeof import('../src/shared/safe-bot-respawn.js');
const {neutralizeTerritory,setOwner}=await load('territory') as typeof import('../src/shared/territory.js');
const {updateBotEmotion}=await load('bot-emotion') as typeof import('../src/shared/bot-emotion.js');
// Replay the frozen 6c307e3 encounter, then apply the current integrated selector.
const seed=137,m=createMatch({mapRadius:56,maxSlots:14,spawnRadius:1},seed,botSpecs(14,0,'bot',{seed}));setSafeBotRespawn(m,true);
const memories=new Map(m.participants.map(p=>[p.participantId,createBotMemory(botSeed(seed,p.slot),'combined',createBotIdentity(botSeed(seed,p.slot),p.personality!))]));
const self=m.participants[7],memory=memories.get(self.participantId)!,originalRandom=memory.random;let randomCalls=0;
memory.random=()=>{randomCalls++;return originalRandom();};
const hash=createHash('sha256');let prefixHash='';
while(m.tick<=5761){const inputs=getBotInputs(m,memories);if(m.tick===5761)break;const prefix=m.tick<3600;if(prefix)hash.update(JSON.stringify([...inputs]));stepMatch(m,inputs);if(prefix){hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer,m.trailMasks.byteOffset,m.trailMasks.byteLength));hash.update(JSON.stringify(m.participants.map(p=>({lifeId:p.lifeId,lifeState:p.lifeState,position:p.position,direction:p.direction,seq:p.lastAppliedInputSeq}))));if(m.tick===3600)prefixHash=hash.digest('hex');}}
const reference=JSON.parse(readFileSync('evidence/bot-reposition-start-safety/seed137-case.json','utf8'));if(prefixHash!==reference.prefixHash)throw Error('Current audited prefix mismatch');
if(memory.goal!=='REPOSITION'||memory.reposition.active?.startedTick!==5761)throw Error('Original normal movement no longer reproduces 5761');
const obs=observeBot(m,self.participantId),original={path:[...memory.path],owners:memory.path.map(id=>m.owners[id]),projection:projectDeparture(obs,memory.path,'REPOSITION')};
const countBefore=randomCalls,candidates:any[]=[],cooldownBefore=memory.reposition.cooldownUntil;
const integrated=currentSelect(obs,memory.emotion,memory.reposition,memory.identity,shortestPath);
if(integrated.plan||integrated.reason!=='PHYSICAL_START_UNSAFE'||integrated.startChecked<1||integrated.startChecked>8||integrated.startRejected!==integrated.startChecked||integrated.firstStartRejection?.firstCell!==2726||memory.reposition.cooldownUntil!==cooldownBefore)throw Error('Integrated unsafe start regression failed: '+JSON.stringify(integrated));
// This callback prototype proves candidate rejection only; an implementation
// will retain old scoring/tie order and lazily filter positive ranked plans.
const filtered=selectReposition(obs,memory.emotion,memory.reposition,memory.identity,(...args)=>{const path=shortestPath(...args);if(!path)return path;const projection=projectDeparture(obs,path,'REPOSITION');candidates.push({target:path.at(-1),length:path.length,allPathCellsOwned:path.every(id=>m.owners[id]===self.slot+1),projection});return projection.allOwned&&!projection.blocked?path:null;});
if(original.owners.some(owner=>owner!==8)||original.projection.firstCell!==2726||original.projection.allOwned)throw Error('Unsafe geometric case not reproduced');
if(filtered.plan||candidates.length>8||candidates.some(c=>c.projection.allOwned&&!c.projection.blocked)||randomCalls!==countBefore)throw Error('Prototype failed to reject unsafe starts or consumed RNG');
// Safe physical control: a straight owned corridor under actual bot movement.
const normal=createMatch({mapRadius:28},19,botSpecs(3)),[a,b,c]=normal.participants,id=(q:number,r=0)=>normal.map.byKey.get(q+','+r)!;
for(const p of normal.participants)neutralizeTerritory(normal,p);
a.personality='DEFEND';a.cellId=id(0);b.cellId=id(25);c.cellId=id(-25);for(const p of normal.participants){p.position={...normal.map.cells[p.cellId].center};p.direction={x:1,y:0};setOwner(normal,p.cellId,p.slot+1);}
for(let q=0;q<=14;q++)for(let r=-2;r<=2;r++)setOwner(normal,id(q,r),a.slot+1);
const nm=createBotMemory(19,'combined',createBotIdentity(19,'DEFEND',{secondaryTrait:'Territorial'}));updateBotEmotion(observeBot(normal,a.participantId),nm.emotion,nm.identity);nm.plannedLifeId=a.lifeId;
for(const q of [17,18])for(const r of [-1,0,1]){const cell=id(q,r);setOwner(normal,cell,b.slot+1);nm.emotion.damage.regions.set(cell,{attackerId:b.participantId,tick:0});}nm.emotion.damage.recent.set(b.participantId,[{tick:0,cells:6,observedCells:0}]);
const normalObs=observeBot(normal,a.participantId),selection=currentSelect(normalObs,nm.emotion,nm.reposition,nm.identity,shortestPath);if(!selection.plan)throw Error('No normal control');
const normalSafety=evaluateRepositionStartSafety(normalObs,selection.plan.path);if(!normalSafety.safe)throw Error('Normal integrated safety rejected');
const normalProjection=projectDeparture(normalObs,selection.plan.path,'REPOSITION');if(!normalProjection.allOwned||normalProjection.blocked)throw Error('Safe control rejected');
startReposition(normalObs,nm.reposition,selection.plan);nm.goal='REPOSITION';nm.path=[...selection.plan.path];let maxTrail=0,allOwned=true;
for(let t=0;t<30;t++){const input=currentGetBotInput(observeBot(normal,a.participantId),nm);stepMatch(normal,input?new Map([[a.participantId,input]]):new Map());maxTrail=Math.max(maxTrail,a.trailCells.size);allOwned&&=normal.owners[a.cellId]===a.slot+1;}
if(maxTrail||!allOwned||a.lifeState!=='ALIVE')throw Error('Safe control fails actual movement');
const output={proposalOnly:false,integrated:{...integrated,decisionRngDelta:randomCalls-countBefore},runtimeBaseline:'6c307e3',seed,slot:7,tick:5761,prefixMatchesAudit:true,prefixHash,original,prototype:{candidateDestinations:candidates.length,candidates,unsafeCandidateRejected:true,filteredPlanPresent:!!filtered.plan,decisionRngDelta:randomCalls-countBefore},normalControl:{pathLength:selection.plan.path.length,projection:normalProjection,actualTicks:30,maxTrail,allOwned,alive:a.lifeState==='ALIVE'},limits:['Frozen original encounter with current integrated selector; full-match audit reported separately.','Rejecting relocation does not guarantee the replacement action stays owned; at frozen5761 no safe owned-neighbor fallback exists.','Prediction holds current public ownership and observed environment fixed; future captures/new strategy/other inputs can change it.']};
mkdirSync('../bot-rp-start-proposal',{recursive:true});writeFileSync('../bot-rp-start-proposal/implementation-case.json',JSON.stringify(output,null,2));console.log(JSON.stringify({integrated:output.integrated,normalControl:output.normalControl,prefixHash}));

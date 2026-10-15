import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {createBotMemory,createGameplayBotMemory,observeBot,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';
import {createBotIdentity,botSeed} from '../../src/shared/bot-identity.js';
import {getBotInputs,botDirector} from '../../src/shared/bot-director.js';
import {setBotEncounterExperiment,type BotEncounterExperiment} from '../../src/shared/bot-encounter-experiment.js';
import {watchBotCandidates} from '../../src/shared/bot-candidate-diagnostics.js';
import {evaluateDepartureSafety} from '../../src/shared/bot-immediate-safety.js';
import {runBotTactics} from '../../src/shared/bot-tactical.js';
import {setOwner,addTrail,assertOwnershipCounts} from '../../src/shared/territory.js';
import {hexDistance} from '../../src/shared/hex.js';
import type {Personality} from '../../src/shared/model.js';

function fixture(role:Personality='EXPAND',gap=0,gameplay=false){
 const m=createMatch({mapRadius:24,maxSlots:4},4,[{participantId:'h',slot:0,nickname:'H',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'BOT',personality:role}]);
 const [human,self]=m.participants,id=(q:number,r=0)=>m.map.byKey.get(q+','+r)!;
 m.owners.fill(0);m.trailMasks.fill(0);
 for(const p of m.participants){p.territoryCount=0;p.trailCells.clear();p.trailOriginCellId=null;p.spawnCells.clear();p.protectedUntilTick=0;}
 for(const c of m.map.cells){if(c.q>=-10&&c.q<=0&&Math.abs(c.r)<=8)setOwner(m,c.id,2);if(c.q>=1+gap&&c.q<=10+gap&&Math.abs(c.r)<=8)setOwner(m,c.id,1);}
 for(const [p,q]of [[self,0],[human,2+gap]] as const){p.cellId=id(q);p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};p.targetDirection=null;p.spawnCells.add(p.cellId);}
 const memory=(gameplay?createGameplayBotMemory:createBotMemory)(botSeed(4,1),'combined',createBotIdentity(botSeed(4,1),role));
 return {m,human,self,id,memory};
}
function run(role:Personality,arm:BotEncounterExperiment|null,gap=0,trace=false,gameplay=false){
 const {m,self,human,memory}=fixture(role,gap,gameplay),memories=new Map([['b',memory]]),hash=createHash('sha256'),external:number[]=[];
 if(arm)setBotEncounterExperiment(memory,arm);
 if(trace)watchBotDecisions(memory,()=>{}, {shadow:false});
 watchBotCandidates(memory,(o,batch)=>{if(batch.kind==='STRATEGY'&&o.others.some(p=>hexDistance(o.map.cells[p.cellId],o.map.cells[o.self.cellId])<=6))for(const c of batch.candidates)if(c.expansion)external.push(c.expansion.externalLength);});
 for(let n=0;n<90&&m.phase==='RUNNING'&&self.lifeState==='ALIVE'&&human.lifeState==='ALIVE';n++){
  const inputs=getBotInputs(m,memories);hash.update(JSON.stringify([...inputs]));stepMatch(m,inputs);hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer));hash.update(JSON.stringify(m.participants));
 }
 assertOwnershipCounts(m);
 return {external,proof:{trajectory:hash.digest('hex'),nextRng:memory.random(),director:botDirector(m).snapshot()}};
}

it.each([0,2])('offers longer explorer candidates with %s neutral gap cells, while the baseline keeps its six-cell ceiling',gap=>{
 const baseline=run('EXPAND',null,gap),candidate=run('EXPAND','explorer-commit',gap);
 expect(baseline.external.length).toBeGreaterThan(0);expect(Math.max(...baseline.external)).toBeLessThanOrEqual(6);
 expect(candidate.external.some(n=>n>6)).toBe(true);
 expect(candidate.proof.trajectory).not.toBe(baseline.proof.trajectory);
});

it.each(['ATTACK','DEFEND','SEEK_POINT'] as const)('leaves %s trajectories, action RNG and director reservations unchanged',role=>{
 const baseline=run(role,null);
 for(const arm of ['explorer-footprint','explorer-commit'] as const)expect(run(role,arm).proof).toEqual(baseline.proof);
 expect(run(role,null,0,false,true).proof).toEqual(baseline.proof);
});

it.each([0,2])('gameplay defaults reproduce the approved B trajectory and RNG with %s neutral gap cells',gap=>{
 expect(run('EXPAND',null,gap,false,true).proof).toEqual(run('EXPAND','explorer-commit',gap).proof);
});

it('keeps opt-in decision diagnostics independent of the experiment trajectory and RNG',()=>{
 expect(run('EXPAND','explorer-commit',0,true).proof).toEqual(run('EXPAND','explorer-commit').proof);
});

it('retains the immediate physical departure guard in the committed-explorer experiment',()=>{
 const {m,self,human,id,memory}=fixture();setBotEncounterExperiment(memory,'explorer-commit');
 human.cellId=id(2);human.position={...m.map.cells[human.cellId].center};
 const result=evaluateDepartureSafety(observeBot(m,self.participantId),[id(1),id(2),id(2,-1),id(1,-1),id(0)],'EXPAND');
 expect(result.blocked).toBe(true);expect(result.reason).toBe('NEAR_HEAD');
});

it('still retreats when the actual exposed trail is threatened, without consuming action RNG',()=>{
 const {m,self,human,id,memory}=fixture();setBotEncounterExperiment(memory,'explorer-commit');
 self.cellId=id(2);self.position={...m.map.cells[self.cellId].center};human.cellId=id(3);human.position={...m.map.cells[human.cellId].center};
 addTrail(m,self,id(1));addTrail(m,self,id(2));memory.plannedLifeId=self.lifeId;memory.goal='EXPAND';memory.path=[id(3),id(4),id(4,-1),id(3,-1),id(2,-1),id(1,-1),id(0,-1)];
 memory.random=()=>{throw Error('action RNG must not be consumed');};
 const trace:BotDecisionTrace={tick:0,from:'EXPAND',to:'EXPAND',ownTrail:2,attackTarget:null,attacks:[]};
 runBotTactics(observeBot(m,self.participantId),memory,false,undefined,path=>memory.path=path,trace);
 expect(trace.risk?.danger).toBe(true);expect(memory.goal).toBe('ESCAPE');expect(memory.path.length).toBeGreaterThan(0);
});

it('clears the experimental setting without consuming RNG or altering serialized memory',()=>{
 const {memory}=fixture(),control=fixture().memory,before=JSON.stringify(memory);
 setBotEncounterExperiment(memory,'explorer-commit');setBotEncounterExperiment(memory,null);
 expect(JSON.stringify(memory)).toBe(before);expect(memory.random()).toBe(control.random());
});

import {expect,it} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,observeBot} from '../../src/shared/bot.js';
import {planExpansion} from '../../src/shared/bot-strategy.js';
import {watchBotCandidates,type BotCandidateBatch} from '../../src/shared/bot-candidate-diagnostics.js';
import {hexDistance} from '../../src/shared/hex.js';
import {evaluateDepartureSafety,expansionPerimeterBlocked} from '../../src/shared/bot-immediate-safety.js';

function fixture(cells:number,visible:boolean){
 const match=createMatch({mapRadius:22},73,botSpecs(2)),p=match.participants[0],enemy=match.participants[1];
 p.personality='EXPAND';p.cellId=match.map.byKey.get('4,0')!;p.position={...match.map.cells[p.cellId].center};p.direction={x:1,y:0};p.trailCells.clear();
 const home=[...match.map.cells].sort((a,b)=>hexDistance(a,{q:0,r:0})-hexDistance(b,{q:0,r:0})||a.id-b.id).slice(0,cells);
 match.owners.fill(0);for(const c of home)match.owners[c.id]=p.slot+1;p.territoryCount=cells;
 enemy.cellId=match.map.byKey.get('12,0')!;enemy.position={...match.map.cells[enemy.cellId].center};enemy.lifeState=visible?'ALIVE':'DEAD_WAIT';
 return observeBot(match,p.participantId);
}
function choices(cells:number,visible:boolean,seed:number){
 const obs=fixture(cells,visible),memory=createBotMemory(seed);let batch:BotCandidateBatch|undefined;
 watchBotCandidates(memory,(_obs,b)=>{if(b.kind==='STRATEGY')batch=b;});planExpansion(obs,memory);expect(batch).toBeDefined();return {obs,memory,batch:batch!};
}
it('adds quiet larger candidates only after 64 owned cells, and keeps ordinary candidates',()=>{
 for(const [cells,visible]of [[63,false],[64,true]] as const)for(let seed=1;seed<=8;seed++)expect(choices(cells,visible,seed).batch.candidates.some(c=>c.expansion?.quietLarge)).toBe(false);
 let added=0;for(let seed=1;seed<=8;seed++){
  const {obs,memory,batch}=choices(64,false,seed),large=batch.candidates.filter(c=>c.expansion?.quietLarge);
  added+=large.length;expect(batch.candidates.some(c=>c.expansion&&!c.expansion.quietLarge)).toBe(true);
  for(const c of large){expect(c.path.length).toBeLessThanOrEqual(24);expect(c.expansion!.externalLength).toBeLessThanOrEqual(20);expect(obs.owners[c.path.at(-1)!]).toBe(obs.self.slot+1);expect(batch.candidates.filter(v=>v.path.join(',')===c.path.join(',')).length).toBe(1);}
  const chosen=batch.candidates[batch.selectedIndex];if(chosen?.expansion){expect(evaluateDepartureSafety(obs,chosen.path,chosen.goal).blocked).toBe(false);expect(expansionPerimeterBlocked(obs,chosen.path,chosen.goal)).toBe(false);expect(memory.expansion?.quietLarge).toBe(chosen.expansion.quietLarge);}
 }expect(added).toBeGreaterThan(0);
});

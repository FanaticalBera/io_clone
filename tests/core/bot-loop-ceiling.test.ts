import {expect,it} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,observeBot} from '../../src/shared/bot.js';
import {quietLoopEligible,activeExpansionTrailLimit} from '../../src/shared/bot-loop-ceiling.js';
import {runBotTactics} from '../../src/shared/bot-tactical.js';
it('admits only quiet quota-sized holdings and counts dead roster members in quota',()=>{
 const match=createMatch({mapRadius:56,spawnRadius:1},73,botSpecs(14)),self=match.participants[0];
 for(const p of match.participants.slice(1))p.lifeState='DEAD_WAIT';
 const obs=observeBot(match,self.participantId);obs.self.territoryCount=255;expect(quietLoopEligible(obs)).toBe(false);
 obs.self.territoryCount=256;expect(quietLoopEligible(obs)).toBe(true);
 obs.others=[{...obs.self,participantId:'visible-enemy',slot:1}];expect(quietLoopEligible(obs)).toBe(false);
});
it('carries a selected expansion allowance on return but keeps attack budgets and observed-head danger',()=>{
 const match=createMatch({mapRadius:56,spawnRadius:1},73,botSpecs(14)),self=match.participants[0];self.personality='DEFEND';
 for(const p of match.participants.slice(1))p.lifeState='DEAD_WAIT';
 const obs=observeBot(match,self.participantId),memory=createBotMemory(19);obs.self.territoryCount=256;
 const id=(q:number,r=0)=>match.map.byKey.get(q+','+r)!;obs.ownTrail=Array.from({length:14},(_,n)=>id(n+2));
 memory.plannedLifeId=self.lifeId;memory.lastCell=self.cellId;memory.goal='EXPAND';memory.path=[self.cellId];
 memory.expansion={shape:'RHOMBUS',pathLength:32,externalLength:20,captureSize:40,stolenCells:0,earlyClosed:false,quietTrailLimit:21};
 const setPath=(path:number[])=>memory.path=path;
 expect(runBotTactics(obs,memory,false,undefined,setPath).danger).toBe(false);
 memory.goal='RETURN';expect(activeExpansionTrailLimit(memory,12)).toBe(21);
 memory.goal='ATTACK';expect(activeExpansionTrailLimit(memory,12)).toBe(12);
 memory.goal='EXPAND';obs.others=[{...obs.self,participantId:'visible-enemy',slot:1,cellId:id(2,1)}];
 expect(runBotTactics(obs,memory,false,undefined,setPath).danger).toBe(true);
 expect(memory.goal).toBe('ESCAPE');
});

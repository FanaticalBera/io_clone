import {it,expect} from 'vitest';
import {createMatch,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot,watchBotDecisions,type BotDecisionTrace} from '../../src/shared/bot.js';

// Production practice/room seeding, normal spawn and movement throughout.
// No state, territory, trail, goal or position is injected.
it('seed 78: thief intercepts a clear three-cell cut instead of turning into another expansion',()=>{
 const m=createMatch({},78,[{participantId:'idle',slot:0,nickname:'IDLE',kind:'HUMAN'},...botSpecs(7,1)]),human=m.participants[0],p=m.participants[4],mem=m.participants.slice(1).map(p=>createBotMemory(78^(p.slot*2654435761)));
 let trace:BotDecisionTrace|undefined,intercepted=false;watchBotDecisions(mem[3],t=>{trace=t;});
 for(let tick=0;tick<150;tick++){
  trace=undefined;const inputs=new Map();m.participants.slice(1).forEach((bot,i)=>{const input=getBotInput(observeBot(m,bot.participantId),mem[i]);if(input)inputs.set(bot.participantId,input);});
  if(m.tick===78){const t=trace as BotDecisionTrace|undefined;expect(human.trailCells.size).toBeGreaterThan(0);expect(t?.from).toBe('EXPAND');expect(t?.to).toBe('ATTACK');expect(t?.attackSlot).toBe(0);intercepted=true;}
  stepMatch(m,inputs);
  if(intercepted&&human.lifeState==='DEAD_WAIT'&&p.trailCells.size===0&&m.owners[p.cellId]===p.slot+1)break;
 }
 expect(intercepted).toBe(true);expect(human.deathReason).toBe('TRAIL_CUT');expect(p.kills).toBeGreaterThan(0);expect(p.lifeState).toBe('ALIVE');
 expect(p.trailCells.size).toBe(0);expect(m.owners[p.cellId]).toBe(p.slot+1);expect([...m.trailMasks].every(mask=>(mask&(1<<p.slot))===0)).toBe(true);
 expect(m.events.filter(e=>e.type==='DEATH'&&e.participantId===human.participantId&&e.killerId===p.participantId)).toHaveLength(1);
});

import {it,expect} from 'vitest';
import {BotOutcomeTracker} from '../bot-outcome-tracker.js';
import {createMatch} from '../baseline.js';
import {botSpecs,createBotMemory} from '../../src/shared/bot.js';
import {addTrail} from '../../src/shared/territory.js';
function fixture(){
 const m=createMatch({},4,botSpecs(3)),[p,v]=m.participants,memory=createBotMemory(4),tracker=new BotOutcomeTracker();
 addTrail(m,v,v.cellId);memory.goal='ATTACK';memory.attackSlot=v.slot;memory.attackTarget=v.cellId;tracker.before(m,p,memory);
 return {m,p,v,memory,tracker,before:m.eventCounter};
}
it('counts only the targeted victim and actual killer as an attack success',()=>{
 const f=fixture();f.m.events.push({eventId:`x:${f.before+1}`,tick:1,type:'DEATH',participantId:f.v.participantId,lifeId:f.v.lifeId,killerId:f.p.participantId,deathContext:{cause:'EXISTING_TRAIL_CONTACT',cellId:f.v.cellId}});
 f.tracker.after(f.m,f.p,f.before);expect(f.tracker.episodes[0]).toMatchObject({result:'SUCCESS_KILL',successfulCut:true,returnedAlive:true});
 // Goals update on decisions, later than authoritative events. The stale goal
 // must not create another attempt before it leaves ATTACK.
 f.tracker.before(f.m,f.p,f.memory);expect(f.tracker.episodes).toHaveLength(1);
 const other=fixture();other.m.events.push({eventId:`x:${other.before+1}`,tick:1,type:'DEATH',participantId:other.v.participantId,lifeId:other.v.lifeId,killerId:'third'});
 other.tracker.after(other.m,other.p,other.before);expect(other.tracker.episodes[0]).toMatchObject({result:'TARGET_GONE',successfulCut:false});
});
it('separates an unfinished attack, victim capture and simultaneous trade',()=>{
 const f=fixture();expect(f.tracker.episodes[0].result).toBeUndefined();f.v.trailCells.clear();f.m.events.push({eventId:`x:${f.before+1}`,tick:1,type:'CAPTURE',participantId:f.v.participantId});
 f.tracker.after(f.m,f.p,f.before);expect(f.tracker.episodes[0].result).toBe('TARGET_RETURNED');
 const trade=fixture();trade.p.lifeState='DEAD_WAIT';trade.m.events.push({eventId:`x:${trade.before+1}`,tick:1,type:'DEATH',participantId:trade.v.participantId,lifeId:trade.v.lifeId,killerId:trade.p.participantId});
 trade.tracker.after(trade.m,trade.p,trade.before);expect(trade.tracker.episodes[0]).toMatchObject({result:'SUCCESS_KILL',diedDuringAttack:true,returnedAlive:false});
});

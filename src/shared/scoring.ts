import type {MatchState,MatchView,ResultRow,MatchOutcome} from './model.js';
import {clearTrail} from './territory.js';
import {emitEvent} from './life.js';
import {roundDeadlineTicks} from './modes.js';
export function computeResults(match:MatchState):ResultRow[] {
 const excluded=new Set(match.departed.map(p=>p.participantId));
 const rows=match.participants.filter(p=>!excluded.has(p.participantId)).map(p=>({
  participantId:p.participantId,nickname:p.nickname,kind:p.kind,score:p.territoryCount,
  territory:p.territoryCount,controlScore:p.controlScore,kills:p.kills,deaths:p.deaths,rank:null as number|null,status:'FINISHED' as const
 }));
 rows.sort((a,b)=>Number(b.participantId===match.outcome?.winnerId)-Number(a.participantId===match.outcome?.winnerId)||b.territory-a.territory||b.kills-a.kills||a.participantId.localeCompare(b.participantId));
 let rank=0;
 for(let i=0;i<rows.length;i++){
  const p=rows[i],previous=rows[i-1];
  if(!previous||p.territory!==previous.territory||p.kills!==previous.kills||previous.participantId===match.outcome?.winnerId)rank=i+1;
  p.rank=rank;
 }
 return [...rows,...match.departed.map(row=>({...row}))];
}
export function finishMatch(match:MatchState,outcome:MatchOutcome):void {
 if(match.phase!=='RUNNING')return;
 match.outcome={...outcome};match.results=computeResults(match);match.phase='FINISHED';
 for(const p of match.participants){clearTrail(match,p);p.lifeState='FINISHED';p.protectedUntilTick=0;}
 emitEvent(match,{type:'FINISH',participantId:outcome.winnerId});
}
export function buildView(match:MatchState):MatchView {
 return {matchId:match.matchId,seed:match.seed,tick:match.tick,
  remainingTicks:roundDeadlineTicks(match)===null?null:Math.max(0,roundDeadlineTicks(match)!-match.tick),
  gameMode:{...match.gameMode},modeState:{holds:match.modeState.holds.map(h=>({...h}))},outcome:match.outcome?{...match.outcome}:null,
  phase:match.phase,config:{...match.config},mapId:match.map.mapId,owners:match.owners.slice(),trailMasks:match.trailMasks.slice(),
  participants:match.participants.map(p=>{const {trailCells:_,spawnCells:__,...rest}=p;return{...rest,...(p.deathContext?{deathContext:{...p.deathContext}}:{}),position:{...p.position},direction:{...p.direction},targetDirection:p.targetDirection?{...p.targetDirection}:null,
   protected:p.lifeState==='ALIVE'&&match.tick<p.protectedUntilTick&&p.spawnCells.has(p.cellId)&&match.owners[p.cellId]===p.slot+1};}),
  events:match.events.filter(e=>e.tick>=match.tick-match.config.simulationHz).slice(-64).map(e=>({...e,...(e.position?{position:{...e.position}}:{}),...(e.deathContext?{deathContext:{...e.deathContext}}:{})})),
  results:match.results?.map(p=>({...p}))??null};
}

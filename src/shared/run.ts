import type {MatchState,Participant,RunResult} from './model.js';
import {territoryPercent,GAME_MODES,isWinner} from './modes.js';
const respawning=(match:MatchState)=>GAME_MODES[match.gameMode.id].humanRespawnSeconds!==null;
const resolutions=new WeakMap<MatchState,number>();
export function startRun(match:MatchState,p:Participant,atTick=match.tick):void {
 if(p.kind!=='HUMAN'||p.lifeState!=='ALIVE'||p.run?.lifeId===p.lifeId)return;
 // A respawning round is one run: the new life inherits its start, kills baseline and best territory.
 const carried=respawning(match)&&p.run&&!p.run.result?p.run:null;
 if(carried){p.run={runId:match.matchId+':'+p.participantId+':life:'+p.lifeId,lifeId:p.lifeId,startedAtTick:carried.startedAtTick,initialKills:carried.initialKills,bestTerritoryCells:Math.max(carried.bestTerritoryCells,p.territoryCount),pendingDeathAtTick:null,result:null};return;}
 p.run={runId:match.matchId+':'+p.participantId+':life:'+p.lifeId,lifeId:p.lifeId,startedAtTick:atTick,initialKills:p.kills,bestTerritoryCells:p.territoryCount,pendingDeathAtTick:null,result:null};
}
export function recordBestTerritories(match:MatchState):void {
 for(const p of match.participants)if(p.kind==='HUMAN'&&p.lifeState==='ALIVE'){startRun(match,p);if(p.run&&!p.run.result&&p.run.pendingDeathAtTick===null)p.run.bestTerritoryCells=Math.max(p.run.bestTerritoryCells,p.territoryCount);}
}
export function queueRunDeath(match:MatchState,p:Participant,atTick:number):void {
 startRun(match,p,atTick);if(p.run&&!p.run.result&&p.run.pendingDeathAtTick===null){p.run.bestTerritoryCells=Math.max(p.run.bestTerritoryCells,p.territoryCount);if(!respawning(match))p.run.pendingDeathAtTick=atTick;}
}
function finishRun(match:MatchState,p:Participant,endReason:RunResult['endReason'],atTick:number):void {
 const run=p.run;if(!run||run.result)return;
 const best=run.bestTerritoryCells;
 run.result=Object.freeze({runId:run.runId,matchId:match.matchId,participantId:p.participantId,lifeId:run.lifeId,endReason,startedAtTick:run.startedAtTick,endedAtTick:atTick,durationTicks:Math.max(0,atTick-run.startedAtTick),simulationHz:match.config.simulationHz,mapCellCount:match.map.cells.length,kills:Math.max(0,p.kills-run.initialKills),bestTerritoryCells:best,bestTerritoryPercent:territoryPercent(best,match.map.cells.length)});
}
export function settleRuns(match:MatchState):void {
 recordBestTerritories(match);for(const p of match.participants)if(p.run?.pendingDeathAtTick!==null&&p.run?.pendingDeathAtTick!==undefined)finishRun(match,p,'DEATH',p.run.pendingDeathAtTick);
}
export function beginRunResolution(match:MatchState):void {recordBestTerritories(match);resolutions.set(match,(resolutions.get(match)??0)+1);}
export function endRunResolution(match:MatchState):void {const depth=(resolutions.get(match)??1)-1;resolutions.set(match,depth);if(depth===0)settleRuns(match);}
export function settleUnbatchedRuns(match:MatchState):void {if(!resolutions.get(match))settleRuns(match);}
export function finishMatchRuns(match:MatchState,outcome:{winnerId:string;coWinnerIds?:readonly string[]},atTick:number):void {
 settleRuns(match);
 // A timed round settles every human, alive or waiting to respawn, by final standing.
 if(respawning(match)){for(const p of match.participants)if(p.kind==='HUMAN'&&p.lifeState!=='ELIMINATED')finishRun(match,p,isWinner(outcome,p.participantId)?'TIME_WIN':'TIME_LOSS',atTick);return;}
 for(const p of match.participants)if(p.kind==='HUMAN'&&p.lifeState==='ALIVE')finishRun(match,p,p.participantId===outcome.winnerId?'FULL_CAPTURE_WIN':'FULL_CAPTURE_LOSS',atTick);
}
export function copyRun(run:Participant['run']):Participant['run'] {return run?{...run,result:run.result?{...run.result}:null}:null;}

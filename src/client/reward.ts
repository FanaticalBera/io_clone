import type {RunResult} from '../shared/model.js';
export const REWARD_RULES=Object.freeze({baseCoins:5,territoryCoinsPerPercent:2,killCoins:3,rewardedKillCap:10,classicClearBonus:100});
export interface RewardResult {runId:string;baseCoins:number;territoryCoins:number;killCoins:number;clearBonusCoins:number;totalCoins:number}
const integer=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function validateRewardRun(r:RunResult):void {
 if(!r||typeof r.matchId!=='string'||!r.matchId.length||r.matchId.length>128||typeof r.participantId!=='string'||!r.participantId.length||r.participantId.length>128||!integer(r.lifeId)||r.lifeId<1||r.runId!==r.matchId+':'+r.participantId+':life:'+r.lifeId||!['DEATH','FULL_CAPTURE_WIN','FULL_CAPTURE_LOSS'].includes(r.endReason)||
 !integer(r.kills)||!integer(r.mapCellCount)||r.mapCellCount<1||!integer(r.bestTerritoryCells)||r.bestTerritoryCells>r.mapCellCount||r.bestTerritoryPercent!==Math.floor(r.bestTerritoryCells*1000/r.mapCellCount)/10||
 !Number.isFinite(r.startedAtTick)||r.startedAtTick<0||!Number.isFinite(r.endedAtTick)||r.endedAtTick<r.startedAtTick||r.durationTicks!==r.endedAtTick-r.startedAtTick||!Number.isFinite(r.simulationHz)||r.simulationHz<=0)throw new Error('Invalid reward Run');
}
export function calculateReward(result:RunResult,initialTerritoryCells=7):RewardResult {
 validateRewardRun(result);if(!integer(initialTerritoryCells)||initialTerritoryCells<1||initialTerritoryCells>result.mapCellCount)throw new Error('Invalid starting territory');
 const progressed=result.bestTerritoryCells>initialTerritoryCells||result.kills>0||result.endReason==='FULL_CAPTURE_WIN';
 const baseCoins=progressed?REWARD_RULES.baseCoins:0;
 const territoryCoins=progressed?Math.floor(Math.round(result.bestTerritoryPercent*10)*REWARD_RULES.territoryCoinsPerPercent/10):0;
 const killCoins=Math.min(result.kills,REWARD_RULES.rewardedKillCap)*REWARD_RULES.killCoins;
 const clearBonusCoins=result.endReason==='FULL_CAPTURE_WIN'?REWARD_RULES.classicClearBonus:0;
 return{runId:result.runId,baseCoins,territoryCoins,killCoins,clearBonusCoins,totalCoins:baseCoins+territoryCoins+killCoins+clearBonusCoins};
}

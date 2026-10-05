import type {MatchState,MatchOutcome} from './model.js';

export type GameModeId='classic';
export type GameModeConfig=Readonly<{id:'classic'}>;
// Reserved empty field preserves the existing Classic snapshot format.
export interface ModeState {holds:[]}
interface ModeDefinition {
 name:string;subtitle:string;description:string;usesControlPoints:boolean;timeLimitSeconds:number|null;
 rules:(mode:GameModeConfig)=>string;evaluate:(match:MatchState,atTick:number)=>MatchOutcome|null;
}
export const GAME_MODE_IDS:readonly GameModeId[]=['classic'];
export function isGameModeId(value:unknown):value is GameModeId{return value==='classic';}
export function validateMode(value:unknown):GameModeConfig{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid game mode');
 const raw=value as Record<string,unknown>;
 if(raw.id==='classic'&&Object.keys(raw).every(k=>k==='id'))return Object.freeze({id:'classic'});
 throw new Error('Invalid game mode');
}
export function createMode(id:GameModeId='classic'):GameModeConfig{
 if(!isGameModeId(id))throw new Error('Invalid game mode');
 return validateMode({id});
}
export const GAME_MODES:Readonly<Record<GameModeId,ModeDefinition>>={
 classic:{name:'CLASSIC',subtitle:'완전 점령',description:'맵 전체를 자신의 영토로 만들면 승리',usesControlPoints:false,timeLimitSeconds:null,
  rules:()=> '100% 점령',evaluate:(match,atTick)=>{
   const winner=match.participants.find(p=>p.lifeState==='ALIVE'&&p.territoryCount===match.map.cells.length);
   return winner?{winnerId:winner.participantId,reason:'FULL_CAPTURE',atTick}:null;
  }}
};
export function evaluateMode(match:MatchState,atTick=match.tick):MatchOutcome|null{
 return match.phase==='RUNNING'?GAME_MODES[match.gameMode.id].evaluate(match,atTick):null;
}
export function roundDeadlineTicks(match:MatchState):number|null{
 const seconds=GAME_MODES[match.gameMode.id].timeLimitSeconds;return seconds===null?null:seconds*match.config.simulationHz;
}
export function territoryPercent(cells:number,total:number):number{return Math.floor(cells*1000/total)/10;}

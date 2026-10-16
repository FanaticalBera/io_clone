import type {MatchState,MatchOutcome} from './model.js';

export type GameModeId='classic'|'timed'|'growth';
export type GameModeConfig=Readonly<{id:GameModeId}>;
// Reserved empty field preserves the existing Classic snapshot format.
export interface ModeState {holds:[]}
interface ModeDefinition {
 name:string;subtitle:string;description:string;usesControlPoints:boolean;timeLimitSeconds:number|null;
 /** Humans come back after humanRespawnSeconds instead of ending their run; the round settles once at the end. */
 humanRespawnSeconds:number|null;
 rules:(mode:GameModeConfig)=>string;evaluate:(match:MatchState,atTick:number)=>MatchOutcome|null;
}
export const GAME_MODE_IDS:readonly GameModeId[]=['classic','timed','growth'];
export function isGameModeId(value:unknown):value is GameModeId{return value==='classic'||value==='timed'||value==='growth';}
export function validateMode(value:unknown):GameModeConfig{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid game mode');
 const raw=value as Record<string,unknown>;
 if(isGameModeId(raw.id)&&Object.keys(raw).every(k=>k==='id'))return Object.freeze({id:raw.id});
 throw new Error('Invalid game mode');
}
export function createMode(id:GameModeId='classic'):GameModeConfig{
 if(!isGameModeId(id))throw new Error('Invalid game mode');
 return validateMode({id});
}
export const GAME_MODES:Readonly<Record<GameModeId,ModeDefinition>>={
 classic:{name:'CLASSIC',subtitle:'완전 점령',description:'맵 전체를 자신의 영토로 만들면 승리',usesControlPoints:false,timeLimitSeconds:null,humanRespawnSeconds:null,
  rules:()=> '100% 점령',evaluate:(match,atTick)=>{
   const winner=match.participants.find(p=>p.lifeState==='ALIVE'&&p.territoryCount===match.map.cells.length);
   return winner?{winnerId:winner.participantId,reason:'FULL_CAPTURE',atTick}:null;
  }},
 timed:{name:'3분 점령전',subtitle:'3분 점령전',description:'3분이 끝났을 때 영토가 가장 넓으면 승리',usesControlPoints:false,timeLimitSeconds:180,humanRespawnSeconds:3,
  rules:()=> '3분 · 영토 1위',evaluate:(match,atTick)=>{
   // A full capture ends the round at once (practically unreachable in three minutes, but never left hanging).
   const full=match.participants.find(p=>p.lifeState==='ALIVE'&&p.territoryCount===match.map.cells.length);
   if(full)return {winnerId:full.participantId,reason:'FULL_CAPTURE',atTick};
   const deadline=roundDeadlineTicks(match);if(deadline===null||atTick<deadline||!match.participants.length)return null;
   // Most territory wins; equal territory goes to kills; equal on both shares the win.
   const ranked=[...match.participants].sort((a,b)=>b.territoryCount-a.territoryCount||b.kills-a.kills||a.participantId.localeCompare(b.participantId));
   const top=ranked[0],winners=ranked.filter(p=>p.territoryCount===top.territoryCount&&p.kills===top.kills);
   return {winnerId:top.participantId,reason:'TIME_UP',atTick,...(winners.length>1?{coWinnerIds:winners.map(p=>p.participantId)}:{})};
  }},
 /** Solo: the timed round's rules; the result is the player's best territory, not their place. */
 growth:{name:'3분 성장 도전',subtitle:'3분 성장 도전',description:'3분 동안 내 최고 점유율 기록을 높여요',usesControlPoints:false,timeLimitSeconds:180,humanRespawnSeconds:3,
  rules:()=> '3분 · 최고 점유율',evaluate:(match,atTick)=>{
   // A full capture ends the round at once (practically unreachable in three minutes, but never left hanging).
   const full=match.participants.find(p=>p.lifeState==='ALIVE'&&p.territoryCount===match.map.cells.length);
   if(full)return {winnerId:full.participantId,reason:'FULL_CAPTURE',atTick};
   const deadline=roundDeadlineTicks(match);if(deadline===null||atTick<deadline||!match.participants.length)return null;
   // Most territory wins; equal territory goes to kills; equal on both shares the win.
   const ranked=[...match.participants].sort((a,b)=>b.territoryCount-a.territoryCount||b.kills-a.kills||a.participantId.localeCompare(b.participantId));
   const top=ranked[0],winners=ranked.filter(p=>p.territoryCount===top.territoryCount&&p.kills===top.kills);
   return {winnerId:top.participantId,reason:'TIME_UP',atTick,...(winners.length>1?{coWinnerIds:winners.map(p=>p.participantId)}:{})};
  }}
};
/** Rounds where humans respawn and settle once at the end (the 3-minute round and growth challenge). */
export const isTimedMode=(id:GameModeId)=>GAME_MODES[id].humanRespawnSeconds!==null;
/** Whether this participant won the finished round (alone or tied for first). */
export function isWinner(outcome:{winnerId:string;coWinnerIds?:readonly string[]}|null|undefined,participantId:string):boolean{
 return !!outcome&&(outcome.winnerId===participantId||!!outcome.coWinnerIds?.includes(participantId));
}
export function evaluateMode(match:MatchState,atTick=match.tick):MatchOutcome|null{
 return match.phase==='RUNNING'?GAME_MODES[match.gameMode.id].evaluate(match,atTick):null;
}
export function roundDeadlineTicks(match:MatchState):number|null{
 const seconds=GAME_MODES[match.gameMode.id].timeLimitSeconds;return seconds===null?null:seconds*match.config.simulationHz;
}
export function territoryPercent(cells:number,total:number):number{return Math.floor(cells*1000/total)/10;}

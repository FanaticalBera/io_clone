import type {MatchState,MatchOutcome,Participant} from './model.js';

export type GameModeId='classic'|'hold';
export type GameModeConfig=Readonly<{id:'classic'}|{id:'hold';targetPercent:number;holdSeconds:number}>;
export interface HoldProgress {participantId:string;startedAtTick:number;endsAtTick:number}
export interface ModeState {holds:HoldProgress[]}
export interface ModeSettings {hold?:{targetPercent?:number;holdSeconds?:number}}
interface ModeDefinition {
 name:string;subtitle:string;description:string;usesControlPoints:boolean;timeLimitSeconds:number|null;
 rules:(mode:GameModeConfig)=>string;evaluate:(match:MatchState,atTick:number)=>MatchOutcome|null;
}
export const GAME_MODE_IDS:readonly GameModeId[]=['classic','hold'];
export const DEFAULT_HOLD=Object.freeze({targetPercent:50,holdSeconds:10});
export function isGameModeId(value:unknown):value is GameModeId{return value==='classic'||value==='hold';}
export function validateMode(value:unknown):GameModeConfig{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid game mode');
 const raw=value as Record<string,unknown>;
 if(raw.id==='classic'&&Object.keys(raw).every(k=>k==='id'))return Object.freeze({id:'classic'});
 if(raw.id==='hold'&&Object.keys(raw).every(k=>['id','targetPercent','holdSeconds'].includes(k))&&
    typeof raw.targetPercent==='number'&&Number.isFinite(raw.targetPercent)&&raw.targetPercent>0&&raw.targetPercent<=100&&
    typeof raw.holdSeconds==='number'&&Number.isFinite(raw.holdSeconds)&&raw.holdSeconds>0&&raw.holdSeconds<=3600)
  return Object.freeze({id:'hold',targetPercent:raw.targetPercent,holdSeconds:raw.holdSeconds});
 throw new Error('Invalid game mode');
}
export function createMode(id:GameModeId='classic',settings:ModeSettings={}):GameModeConfig{
 if(!isGameModeId(id))throw new Error('Invalid game mode');
 return validateMode(id==='classic'?{id}:{id,...DEFAULT_HOLD,...settings.hold});
}
function alive(match:MatchState):Participant[]{return match.participants.filter(p=>p.lifeState==='ALIVE');}
export const GAME_MODES:Readonly<Record<GameModeId,ModeDefinition>>={
 classic:{name:'CLASSIC',subtitle:'완전 점령',description:'맵 전체를 자신의 영토로 만들면 승리',usesControlPoints:false,timeLimitSeconds:null,
  rules:()=> '100% 점령',evaluate:(match,atTick)=>{
   match.modeState.holds=[];const winner=alive(match).find(p=>p.territoryCount===match.map.cells.length);
   return winner?{winnerId:winner.participantId,reason:'FULL_CAPTURE',atTick}:null;
  }},
 hold:{name:'HOLD',subtitle:'영토 유지',description:'목표 점유율을 일정 시간 유지하면 승리',usesControlPoints:false,timeLimitSeconds:null,
  rules:mode=>mode.id==='hold'?mode.targetPercent+'% · '+mode.holdSeconds+'초 유지':'',evaluate:(match,atTick)=>{
   const mode=match.gameMode;if(mode.id!=='hold')throw new Error('Hold settings missing');
   const previous=new Map(match.modeState.holds.map(h=>[h.participantId,h]));
   const required=Math.max(1,Math.ceil(mode.holdSeconds*match.config.simulationHz));
   match.modeState.holds=alive(match).filter(p=>p.territoryCount*100>=match.map.cells.length*mode.targetPercent)
    .sort((a,b)=>match.priority.indexOf(a.slot)-match.priority.indexOf(b.slot))
    .map(p=>previous.get(p.participantId)??{participantId:p.participantId,startedAtTick:atTick,endsAtTick:atTick+required});
   const complete=match.modeState.holds.filter(h=>h.endsAtTick<=atTick+1e-7).sort((a,b)=>a.endsAtTick-b.endsAtTick);
   return complete[0]?{winnerId:complete[0].participantId,reason:'HELD_TERRITORY',atTick:complete[0].endsAtTick}:null;
  }}
};
export function evaluateMode(match:MatchState,atTick=match.tick):MatchOutcome|null{
 return match.phase==='RUNNING'?GAME_MODES[match.gameMode.id].evaluate(match,atTick):null;
}
export function roundDeadlineTicks(match:MatchState):number|null{
 const seconds=GAME_MODES[match.gameMode.id].timeLimitSeconds;return seconds===null?null:seconds*match.config.simulationHz;
}
export function territoryPercent(cells:number,total:number):number{return Math.floor(cells*1000/total)/10;}

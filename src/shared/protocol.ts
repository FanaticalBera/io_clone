import {PROTOCOL_VERSION,validateConfig} from './config.js';
import type {MatchView,DirectionInput,ResultRow} from './model.js';
import {isGameModeId,validateMode,GAME_MODES,type GameModeId,type GameModeConfig} from './modes.js';
export type ErrorCode='INVALID_INPUT'|'INVALID_NICKNAME'|'ROOM_NOT_FOUND'|'ROOM_FULL'|'ALREADY_IN_ROOM'|'NOT_HOST'|'BAD_PHASE'|'SESSION_EXPIRED'|'PROTOCOL_MISMATCH'|'RATE_LIMITED'|'SERVER_BUSY'|'SERVER_OVERLOAD'|'MATCH_ABORTED'|'INTERNAL_ERROR';
export interface AppError {code:ErrorCode;message:string}
export type Ack={ok:true;roomId?:string}|({ok:false}&AppError);
export interface CommandRequest {requestId:string;nickname?:string;code?:string;gameMode?:GameModeId}
export type RoomPhase='WAITING'|'COUNTDOWN'|'RUNNING'|'RESULTS'|'CLOSED';
export interface RoomView {
 roomId:string;mode:'PUBLIC'|'FRIEND';code:string|null;phase:RoomPhase;phaseDeadline:number|null;
 serverTime:number;hostId:string|null;selfMemberId:string;selfParticipantId:string|null;
 members:{memberId:string;nickname:string;connected:boolean;waitingForNextRound:boolean}[];
 waitingForNextRound:boolean;remainingSeconds:number|null;results:ResultRow[]|null;matchId:string|null;mapCellCount:number;
 gameMode:GameModeConfig;outcome:MatchView['outcome'];
}
export interface WireSnapshot extends Omit<MatchView,'owners'|'trailMasks'> {
 protocolVersion:number;snapshotSeq:number;serverTime:number;owners:string;trailMasks:string;lastAppliedInputSeq:number;selfParticipantId:string|null;
}
export interface SessionReady {protocolVersion:number;serverEpoch:string;sessionToken:string}
export interface ClientEvents {
 'room:quickJoin':(data:CommandRequest,ack:(response:Ack)=>void)=>void;
 'room:create':(data:CommandRequest,ack:(response:Ack)=>void)=>void;
 'room:join':(data:CommandRequest,ack:(response:Ack)=>void)=>void;
 'room:start':(data:CommandRequest,ack:(response:Ack)=>void)=>void;
 'room:leave':(data:CommandRequest,ack:(response:Ack)=>void)=>void;
 'control:background':(data:CommandRequest,ack:(response:Ack)=>void)=>void;
 'control:foreground':(data:CommandRequest,ack:(response:Ack)=>void)=>void;
 'input:direction':(data:DirectionInput)=>void;
 'clock:ping':(data:{nonce:string},ack:(data:{nonce:string;serverTime:number})=>void)=>void;
}
export interface ServerEvents {
 'session:ready':(ready:SessionReady)=>void;'room:view':(view:RoomView)=>void;
 'match:init':(snapshot:WireSnapshot)=>void;'match:snapshot':(snapshot:WireSnapshot)=>void;
 'match:result':(data:{matchId:string;results:ResultRow[];gameMode:GameModeConfig;modeState:MatchView['modeState'];outcome:MatchView['outcome']})=>void;'app:error':(error:AppError)=>void;
}
export function record(value:unknown):value is Record<string,unknown> {return !!value&&typeof value==='object'&&!Array.isArray(value);}
function validDeathContext(value:unknown,count:number):boolean {
 return value===undefined||(record(value)&&['TRAIL_CONTACT','EXISTING_TRAIL_CONTACT','PENDING_TRAIL_CONTACT','TRAIL_CAPTURE','HOME_CAPTURE','TERRITORY_LOST','WALL_HIT'].includes(String(value.cause))&&Number.isInteger(value.cellId)&&Number(value.cellId)>=0&&Number(value.cellId)<count&&(value.eventTick===undefined||(typeof value.eventTick==='number'&&Number.isFinite(value.eventTick)&&value.eventTick>=0)));
}
export function validRequest(value:unknown):value is CommandRequest {
 return record(value)&&typeof value.requestId==='string'&&/^[A-Za-z0-9_-]{1,96}$/.test(value.requestId)&&
  (value.gameMode===undefined||isGameModeId(value.gameMode))&&Object.keys(value).every(key=>['requestId','nickname','code','gameMode'].includes(key));
}
export function validDirection(value:unknown):value is DirectionInput {
 return record(value)&&Object.keys(value).every(k=>['matchId','lifeId','seq','dx','dy'].includes(k))&&
 typeof value.matchId==='string'&&value.matchId.length>0&&value.matchId.length<=128&&
 Number.isSafeInteger(value.lifeId)&&Number(value.lifeId)>0&&Number.isSafeInteger(value.seq)&&Number(value.seq)>0&&
 typeof value.dx==='number'&&typeof value.dy==='number'&&Number.isFinite(value.dx)&&Number.isFinite(value.dy)&&Math.abs(value.dx)<=1&&Math.abs(value.dy)<=1;
}
export function encodeBytes(bytes:Uint8Array):string {
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);
}
export function decodeBytes(value:unknown,length:number):Uint8Array {
 if(typeof value!=='string'||value.length!==4*Math.ceil(length/3)||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('Invalid base64');
 const binary=atob(value);if(binary.length!==length)throw new Error('Invalid byte length');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(encodeBytes(bytes)!==value)throw new Error('Noncanonical base64');return bytes;
}
export function packSnapshot(view:MatchView,snapshotSeq:number,serverTime:number,selfParticipantId:string|null):WireSnapshot {
 return {...view,protocolVersion:PROTOCOL_VERSION,snapshotSeq,serverTime,owners:encodeBytes(view.owners),trailMasks:encodeBytes(view.trailMasks),
  lastAppliedInputSeq:view.participants.find(p=>p.participantId===selfParticipantId)?.lastAppliedInputSeq??0,selfParticipantId};
}
export function unpackSnapshot(raw:unknown):MatchView {
 if(!record(raw)||raw.protocolVersion!==PROTOCOL_VERSION||typeof raw.matchId!=='string'||raw.matchId.length>128||
    !Number.isSafeInteger(raw.snapshotSeq)||Number(raw.snapshotSeq)<0||!Number.isSafeInteger(raw.tick)||Number(raw.tick)<0||
    !Number.isFinite(raw.serverTime)||!record(raw.config)||!Array.isArray(raw.participants)||raw.participants.length>8||
    !['RUNNING','FINISHED','ABORTED'].includes(String(raw.phase)))throw new Error('Invalid snapshot');
 const config=validateConfig(raw.config),count=1+3*config.mapRadius*(config.mapRadius+1);
 const gameMode=validateMode(raw.gameMode),timeLimit=GAME_MODES[gameMode.id].timeLimitSeconds;
 if(raw.mapId!=='hex-r'+config.mapRadius+'-a'+config.hexSideWorldUnits+'-v1'||
    raw.remainingTicks!==(timeLimit===null?null:Math.max(0,timeLimit*config.simulationHz-Number(raw.tick))))throw new Error('Invalid map/time');
 const owners=decodeBytes(raw.owners,count),trailMasks=decodeBytes(raw.trailMasks,count);
 if(owners.some(o=>o>config.maxSlots)||trailMasks.some(mask=>mask>=(1<<config.maxSlots)))throw new Error('Invalid board');
 const ids=new Set(),slots=new Set();
 for(const p of raw.participants){
  if(!record(p)||typeof p.participantId!=='string'||p.participantId.length>128||ids.has(p.participantId)||
    !Number.isInteger(p.slot)||Number(p.slot)<0||Number(p.slot)>=config.maxSlots||slots.has(p.slot)||
    typeof p.nickname!=='string'||Array.from(p.nickname).length>16||!['HUMAN','BOT'].includes(String(p.kind))||
    !Number.isSafeInteger(p.lifeId)||Number(p.lifeId)<0||!['ALIVE','DEAD_WAIT','SPAWN_BLOCKED','FINISHED'].includes(String(p.lifeState))||
    !record(p.position)||!record(p.direction)||![p.position.x,p.position.y,p.direction.x,p.direction.y].every(n=>typeof n==='number'&&Number.isFinite(n))||
    (p.targetDirection!==null&&(!record(p.targetDirection)||![p.targetDirection.x,p.targetDirection.y].every(n=>typeof n==='number'&&Number.isFinite(n))||Math.abs(Math.hypot(Number(p.targetDirection.x),Number(p.targetDirection.y))-1)>1e-6))||
    ![p.territoryCount,p.controlScore,p.kills,p.deaths].every(n=>Number.isSafeInteger(n)&&Number(n)>=0)||typeof p.protected!=='boolean'||!validDeathContext(p.deathContext,count))throw new Error('Invalid participant');
  ids.add(p.participantId);slots.add(p.slot);
 }
 if(!Array.isArray(raw.events)||raw.events.length>64||raw.events.some(e=>!record(e)||typeof e.eventId!=='string'||!['CAPTURE','DEATH','SPAWN','POINT','FINISH'].includes(String(e.type))))throw new Error('Invalid events');
 for(const e of raw.events){
  if((e.position!==undefined&&(!record(e.position)||![e.position.x,e.position.y].every(n=>typeof n==='number'&&Number.isFinite(n))))||
     (e.killerId!==undefined&&(typeof e.killerId!=='string'||e.killerId.length>128))||
     (e.lifeId!==undefined&&(!Number.isSafeInteger(e.lifeId)||Number(e.lifeId)<1))||!validDeathContext(e.deathContext,count))throw new Error('Invalid combat event');
 }
 if(!record(raw.modeState)||!Array.isArray(raw.modeState.holds)||raw.modeState.holds.length>8)throw new Error('Invalid mode state');
 const heldIds=new Set<string>();
 for(const h of raw.modeState.holds){
  if(gameMode.id!=='hold'||!record(h)||typeof h.participantId!=='string'||!ids.has(h.participantId)||heldIds.has(h.participantId)||
     typeof h.startedAtTick!=='number'||!Number.isFinite(h.startedAtTick)||h.startedAtTick<0||h.startedAtTick>Number(raw.tick)||
     typeof h.endsAtTick!=='number'||!Number.isFinite(h.endsAtTick)||h.endsAtTick!==h.startedAtTick+Math.max(1,Math.ceil(gameMode.holdSeconds*config.simulationHz)))throw new Error('Invalid hold progress');
  heldIds.add(h.participantId);
 }
 if(raw.phase==='FINISHED'&&raw.outcome===null)throw new Error('Missing outcome');
 if(raw.outcome!==null&&(!record(raw.outcome)||typeof raw.outcome.winnerId!=='string'||!ids.has(raw.outcome.winnerId)||
    raw.phase!=='FINISHED'||raw.outcome.reason!==(gameMode.id==='classic'?'FULL_CAPTURE':'HELD_TERRITORY')||
    typeof raw.outcome.atTick!=='number'||!Number.isFinite(raw.outcome.atTick)||raw.outcome.atTick<0||raw.outcome.atTick>Number(raw.tick)))throw new Error('Invalid outcome');
 const wire=raw as unknown as WireSnapshot;
 return {matchId:wire.matchId,seed:wire.seed,tick:wire.tick,remainingTicks:wire.remainingTicks,phase:wire.phase,config,mapId:wire.mapId,
  owners,trailMasks,participants:wire.participants,events:wire.events,results:wire.results,gameMode,modeState:wire.modeState,outcome:wire.outcome};
}
export class SnapshotGate {
 matchId:string|null=null;lastSeq=-1;private events=new Set<string>();
 reset(matchId:string):void {this.matchId=matchId;this.lastSeq=-1;this.events.clear();}
 accept(raw:WireSnapshot,init=false):MatchView|null {
  if(init&&raw.matchId!==this.matchId)this.reset(raw.matchId);
  if(raw.matchId!==this.matchId||raw.snapshotSeq<=this.lastSeq)return null;
  const view=unpackSnapshot(raw);this.lastSeq=raw.snapshotSeq;
  view.events=view.events.filter(e=>{if(this.events.has(e.eventId))return false;this.events.add(e.eventId);return true;});
  if(this.events.size>2048)this.events=new Set([...this.events].slice(-1024));return view;
 }
}

import {buildView,stepMatch} from './game.js';
import {getBotInput,observeBotForTick,createBotMemory} from './bot.js';
import {packSnapshot,type AppError,type ErrorCode,type RoomView,type WireSnapshot,type ServerEvents} from './protocol.js';
import type {Room,Member,RoomManager,RoomSession} from './rooms.js';
// Fixed-tick room loop shared by the online server (socket.io output) and the LAN host phone (frame output).
// Which snapshots are reliable is decided here once, so both paths keep the same delivery guarantees (PRD 10.3).
export interface Metrics {steps:number;stepMs:number[];snapshotBytes:number;snapshots:number;maxBacklogMs:number}
export type SnapshotKind='init'|'reliable'|'volatile';
export type MatchResultPayload=Parameters<ServerEvents['match:result']>[0];
export interface RoomOutput<S extends RoomSession> {
 /** `active` is true when the member plays in the current match (not waiting for the next round). */
 roomView(room:Room<S>,member:Member<S>,view:RoomView,active:boolean):void;
 /** Returns false when the member has no live connection, so the snapshot was not sent. */
 snapshot(room:Room<S>,member:Member<S>,snapshot:WireSnapshot,kind:SnapshotKind):boolean;
 result(room:Room<S>,member:Member<S>,payload:MatchResultPayload):void;
 aborted(room:Room<S>,member:Member<S>,error:AppError):void;
}
export class RoomLoop<S extends RoomSession> {
 readonly metrics:Metrics={steps:0,stepMs:[],snapshotBytes:0,snapshots:0,maxBacklogMs:0};
 private state=new WeakMap<Room<S>,{revision:number;viewAt:number;matchId:string|null;lastSentTick:number;lastEvent:number;resultId:string|null}>();
 constructor(readonly rooms:RoomManager<S>,protected output:RoomOutput<S>,protected log:(event:string,fields:Record<string,unknown>)=>void=()=>{}){}
 publishRoom(room:Room<S>):void {
  for(const member of room.members.values()){
   const active=!member.waitingForNextRound&&!!room.match?.participants.some(p=>p.participantId===member.memberId);
   this.output.roomView(room,member,this.rooms.view(room,member),active);
  }
 }
 publishSnapshot(room:Room<S>,init=false,reliable=false,only?:S):void {
  if(!room.match)return;const view=buildView(room.match),seq=++room.snapshotSeq,now=this.rooms.sessions.now();
  const base=packSnapshot(view,seq,now,null);
  for(const member of room.members.values()){
   if(member.waitingForNextRound||!member.session.connected||only&&member.session!==only)continue;
   const p=view.participants.find(p=>p.participantId===member.memberId);if(!p)continue;
   const snapshot={...base,selfParticipantId:p.participantId,lastAppliedInputSeq:p.lastAppliedInputSeq};
   if(this.output.snapshot(room,member,snapshot,init?'init':reliable?'reliable':'volatile'))this.metrics.snapshots++;
  }
 }
 synchronize(session:S):void {
  const current=this.rooms.member(session);if(!current)return;
  const active=!current.member.waitingForNextRound&&!!current.room.match?.participants.some(p=>p.participantId===current.member.memberId);
  this.output.roomView(current.room,current.member,this.rooms.view(current.room,current.member),active);
  if(!current.member.waitingForNextRound&&current.room.match)this.publishSnapshot(current.room,true,true,session);
 }
 abort(room:Room<S>,code:ErrorCode='MATCH_ABORTED',message?:string):void {
  message??=code==='SERVER_OVERLOAD'?'서버가 경기 시간을 따라잡지 못해 이 판을 종료했습니다.':'경기가 중단되었습니다. 다시 입장하거나 연습을 선택하세요.';
  for(const member of room.members.values()){
   this.output.aborted(room,member,{code,message});
   member.session.roomId=null;member.session.memberId=null;
  }
  room.phase='CLOSED';room.match=null;room.bots.clear();room.inputs.clear();room.members.clear();this.rooms.rooms.delete(room.roomId);this.log('room_closed',{roomId:room.roomId,code});
 }
 /** Runs one scheduler pass. Returns whether any room is behind (the server stops accepting new rooms then). */
 pump():boolean {
  const now=this.rooms.sessions.now();this.rooms.advance();let overloaded=false;
  for(const room of [...this.rooms.rooms.values()]){
   let cache=this.state.get(room);if(!cache){cache={revision:-1,viewAt:-Infinity,matchId:null,lastSentTick:-1,lastEvent:0,resultId:null};this.state.set(room,cache);}
   try{
    if(room.phase==='RUNNING'&&room.match){
     if(cache.matchId!==room.match.matchId){cache.matchId=room.match.matchId;cache.lastSentTick=-1;cache.lastEvent=0;cache.resultId=null;this.publishRoom(room);this.publishSnapshot(room,true,true);this.log('match_started',{roomId:room.roomId,matchId:room.match.matchId});}
     room.accumulator+=Math.max(0,now-room.lastStepAt)/1000;room.lastStepAt=now;
     this.metrics.maxBacklogMs=Math.max(this.metrics.maxBacklogMs,room.accumulator*1000);
     if(room.accumulator>=3){this.abort(room,'SERVER_OVERLOAD');continue;}
     if(room.accumulator>0.25)overloaded=true;
     const dt=1/room.match.config.simulationHz;let count=0;
     while(room.accumulator+1e-9>=dt&&count<5&&room.match.phase==='RUNNING'){
      const before=performance.now();const inputs=new Map(room.inputs);room.inputs.clear();
      for(const p of room.match.participants)if(p.lifeState==='ALIVE'&&(p.kind==='BOT'||room.members.get(p.participantId)?.session.background||room.members.get(p.participantId)?.session.connected===false)){
       let memory=room.bots.get(p.participantId);if(!memory){memory=createBotMemory(room.match.seed^p.slot);room.bots.set(p.participantId,memory);}memory.seq=Math.max(memory.seq,p.lastAppliedInputSeq);const input=getBotInput(observeBotForTick(room.match,p.participantId,memory),memory,p.kind==='HUMAN');if(input)inputs.set(p.participantId,input);
      }
      stepMatch(room.match,inputs);const duration=performance.now()-before;
      this.metrics.steps++;this.metrics.stepMs.push(duration);if(this.metrics.stepMs.length>30000)this.metrics.stepMs.splice(0,1000);
      room.accumulator-=dt;count++;
     }
     const interval=room.match.config.simulationHz/room.match.config.snapshotHz;
     if(Math.floor(room.match.tick/interval)>Math.floor(cache.lastSentTick/interval)||room.match.phase==='FINISHED'&&cache.resultId!==room.match.matchId){
      const spawn=room.match.events.some(e=>e.type==='SPAWN'&&Number(e.eventId.split(':').at(-1))>cache!.lastEvent);
      this.publishSnapshot(room,false,spawn||room.match.phase==='FINISHED');cache.lastSentTick=room.match.tick;cache.lastEvent=room.match.eventCounter;
     }
     this.rooms.advance();
    }
    if(room.phase==='RESULTS'&&room.match&&cache.resultId!==room.match.matchId){
     cache.resultId=room.match.matchId;
     const payload={matchId:room.match.matchId,results:room.match.results??[],gameMode:room.match.gameMode,modeState:room.match.modeState,outcome:room.match.outcome};
     for(const member of room.members.values())if(room.match.participants.some(p=>p.participantId===member.memberId))this.output.result(room,member,payload);
     this.publishRoom(room);
    }
    if(room.revision!==cache.revision||now-cache.viewAt>=1000){this.publishRoom(room);cache.revision=room.revision;cache.viewAt=now;}
   }catch(error){this.log('match_error',{roomId:room.roomId,error:error instanceof Error?error.stack:'unknown'});this.abort(room);}
  }
  this.rooms.accepting=!overloaded;return overloaded;
 }
}

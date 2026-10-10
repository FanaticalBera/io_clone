import {SnapshotGate,type RoomView,type Ack,type AppError,type WireSnapshot} from '../shared/protocol.js';
import type {MatchView,Vec} from '../shared/model.js';
import type {GameModeId} from '../shared/modes.js';
import {SocketIoTransport,clearSessionToken,type GameTransport,type CommandEvent} from './transport.js';
export {clearSessionToken};
export interface NetworkCallbacks {
 input?:(direction:Vec,seq:number)=>void;room:(view:RoomView)=>void;view:(view:MatchView,selfId:string,init:boolean)=>void;
 error:(error:AppError)=>void;snapshot?:(snapshot:WireSnapshot)=>void;connected?:(connected:boolean)=>void;
 /** LAN: the host phone left the app; play is frozen for at most `graceMs`. */
 paused?:(graceMs:number)=>void;resumed?:()=>void;
}
export class NetworkSession {
 private gate=new SnapshotGate();private disposed=false;private ready=false;private synchronized=false;
 private lastReceived=performance.now();private monitor:ReturnType<typeof setInterval>;private unstable=false;
 private background=document.hidden;private lastPing=-Infinity;private metrics=new URLSearchParams(location.search).get('metrics')==='1';
 private paused=false;private seq=0;private lifeId=0;private room:RoomView|null=null;view:MatchView|null=null;selfId:string|null=null;
 constructor(private callbacks:NetworkCallbacks,readonly transport:GameTransport=new SocketIoTransport()){
  const t=this.transport;
  this.monitor=setInterval(()=>{
   if(this.metrics&&this.ready&&performance.now()-this.lastPing>=2000){
    this.lastPing=performance.now();
    t.ping(2000).then(rtt=>this.showRtt(String(Math.round(rtt))),()=>this.showRtt('대기'));
   }
   if(this.ready&&!this.paused&&this.view?.phase==='RUNNING'&&performance.now()-this.lastReceived>3000&&!this.unstable){this.unstable=true;this.synchronized=false;this.callbacks.connected?.(false);}},500);
  t.on('session:ready',()=>{
   if(this.disposed)return;
   this.ready=true;this.synchronized=false;this.lastReceived=performance.now();this.callbacks.connected?.(true);if(this.background)void this.command('control:background').catch(()=>{});
  });
  t.on('disconnect',()=>{this.ready=false;this.synchronized=false;if(!this.paused)this.callbacks.connected?.(false);});
  t.on('connect_error',error=>this.callbacks.error(error??{code:'MATCH_ABORTED',message:'서버에 연결할 수 없어요. 재시도하거나 봇 연습을 선택하세요.'}));
  t.on('app:error',error=>{this.synchronized=false;this.callbacks.error(error);});
  t.on('room:view',view=>{
   if(this.disposed)return;this.room=view;
   if(view.matchId&&this.view?.matchId!==view.matchId)this.synchronized=false;
   this.callbacks.room(view);
  });
  t.on('room:paused',({graceMs})=>{this.paused=true;this.synchronized=false;this.callbacks.paused?.(graceMs);});
  t.on('room:resumed',()=>{this.paused=false;this.lastReceived=performance.now();this.callbacks.resumed?.();});
  t.on('match:init',raw=>this.receive(raw,true));t.on('match:snapshot',raw=>this.receive(raw,false));
  t.on('match:result',result=>{
   if(this.view&&this.view.matchId===result.matchId&&this.selfId){this.view={...this.view,phase:'FINISHED',results:result.results,gameMode:result.gameMode,modeState:result.modeState,outcome:result.outcome};this.synchronized=false;this.callbacks.view(this.view,this.selfId,false);}
  });
 }
 private showRtt(value:string):void {
  if(this.disposed)return;const output=document.querySelector<HTMLOutputElement>('output[aria-label="최근 30초 프레임 측정"]');
  if(output)output.dataset.rtt=value;
 }
 async connect():Promise<void> {
  if(this.ready)return;
  await new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>{cleanup();reject(new Error('서버 연결에 시간이 걸려요.'));},7000);
   const offReady=this.transport.on('session:ready',()=>{cleanup();resolve();});
   const offError=this.transport.on('connect_error',error=>{cleanup();reject(new Error(error?.message??'서버에 연결할 수 없어요.'));});
   const cleanup=()=>{clearTimeout(timeout);offReady();offError();};
   this.transport.connect();
  });
 }
 private receive(raw:WireSnapshot,init:boolean):void {
  if(this.disposed||this.room?.waitingForNextRound||this.room?.matchId&&raw.matchId!==this.room.matchId)return;
  try{
   const view=this.gate.accept(raw,init);if(!view||!raw.selfParticipantId)return;
   this.view=view;this.selfId=raw.selfParticipantId;const self=view.participants.find(p=>p.participantId===this.selfId);if(!self)return;
   if(this.lifeId!==self.lifeId){this.lifeId=self.lifeId;this.seq=raw.lastAppliedInputSeq;}else this.seq=Math.max(this.seq,raw.lastAppliedInputSeq);
   const wasUnstable=this.unstable;this.lastReceived=performance.now();this.unstable=false;this.synchronized=!this.background;if(wasUnstable)this.callbacks.connected?.(true);this.callbacks.snapshot?.(raw);this.callbacks.view(view,this.selfId,init);
  }catch{this.callbacks.error({code:'PROTOCOL_MISMATCH',message:'경기 상태를 읽을 수 없어요. 새로고침하거나 다시 입장하세요.'});}
 }
 async command(event:CommandEvent,payload:{nickname?:string;code?:string;gameMode?:GameModeId;matchId?:string;runId?:string}={}):Promise<Ack> {
  if(!this.ready)throw new Error('서버 연결을 기다리고 있어요.');
  const request={requestId:Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),...payload};
  for(let attempt=0;attempt<2;attempt++){
   try{return await this.transport.command(event,request,3000);}
   catch(error){if(attempt===1)throw error;}
  }
  throw new Error('요청 결과를 확인할 수 없어요.');
 }
 sendDirection(direction:Vec):void {
  const self=this.view?.participants.find(p=>p.participantId===this.selfId);
  if(this.background||!this.ready||!this.synchronized||!self||self.lifeState!=='ALIVE'||this.view?.phase!=='RUNNING')return;
  const seq=++this.seq;this.callbacks.input?.(direction,seq);this.transport.direction({matchId:this.view.matchId,lifeId:self.lifeId,seq,dx:direction.x,dy:direction.y});
 }
 get hasCurrentState():boolean{return this.ready&&this.synchronized&&!this.background;}
 async setBackground(background:boolean):Promise<void>{
  this.background=background;this.synchronized=false;
  if(!this.ready)return;
  const response=await this.command(background?'control:background':'control:foreground');
  if(!response.ok)this.callbacks.error(response);
 }
 async leave():Promise<void> {if(this.ready){const response=await this.command('room:leave');if(!response.ok)throw new Error(response.message);}else clearSessionToken();}
 testTransportClose(reconnect=true):void {if(import.meta.env.MODE!=='test'||!this.transport.testClose)throw new Error('Test only');this.transport.testClose(reconnect);}
 testReconnect():void {if(import.meta.env.MODE!=='test'||!this.transport.testReconnect)throw new Error('Test only');this.transport.testReconnect();}
 dispose():void {if(this.metrics){const output=document.querySelector<HTMLOutputElement>('output[aria-label="최근 30초 프레임 측정"]');if(output)delete output.dataset.rtt;}clearInterval(this.monitor);this.disposed=true;this.ready=false;this.synchronized=false;this.transport.dispose();}
}

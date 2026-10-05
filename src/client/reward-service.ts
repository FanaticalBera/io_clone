import type {MatchView,RunResult} from '../shared/model.js';
import {ProfileStore} from './profile-store.js';
import type {RunAdmission,RewardReceipt} from './profile.js';
function profileOwner():string {
 const fresh=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>n.toString(16).padStart(2,'0')).join('');
 try{let id=sessionStorage.getItem('hexhold.profile-owner');if(!id||!/^[a-f0-9]{16}$/.test(id)){id=fresh();sessionStorage.setItem('hexhold.profile-owner',id);}return id;}catch{return fresh();}
}
export class RewardService {
 private queue:Promise<unknown>=Promise.resolve();private active:RunAdmission|null=null;private admissions=new Map<string,RunAdmission>();private attempted=new Set<string>();private failures=new Map<string,number>();private receipts=new Map<string,Promise<RewardReceipt>>();
 private ownerId=profileOwner();
 constructor(readonly store:ProfileStore,private show:(runId:string,receipt:RewardReceipt)=>void){}
 private enqueue<T>(action:()=>Promise<T>):Promise<T>{const pending=this.queue.then(action);this.queue=pending.catch(()=>{});return pending;}
 observe(view:MatchView,selfId:string):void {
  const p=view.participants.find(p=>p.participantId===selfId);if(!p||p.kind!=='HUMAN'||!p.run)return;
  if(p.lifeState==='ALIVE'&&!p.run.result){const id=p.run.runId,a:RunAdmission={matchId:view.matchId,participantId:selfId,lifeId:p.lifeId,initialTerritoryCells:1+3*view.config.spawnRadius*(view.config.spawnRadius+1),ownerId:this.ownerId};
   if(this.active&&(this.active.matchId!==a.matchId||this.active.participantId!==a.participantId))this.retire();this.active=a;this.admissions.set(id,a);
   if(this.admissions.size>256){const oldest=this.admissions.keys().next().value!;this.admissions.delete(oldest);this.attempted.delete(oldest);this.failures.delete(oldest);}
   if(!this.attempted.has(id)&&(this.failures.get(id)??0)<Date.now()){this.attempted.add(id);void this.enqueue(()=>this.store.admit(a)).catch(()=>{this.attempted.delete(id);if(this.admissions.has(id))this.failures.set(id,Date.now()+1000);});}
  }else if(p.run.result){void this.present(p.run.result);if(view.phase==='FINISHED')this.retire();}
 }
 present(result:RunResult,retry=false):Promise<RewardReceipt>{
  if(retry)this.receipts.delete(result.runId);const previous=this.receipts.get(result.runId);if(previous){void previous.then(receipt=>this.show(result.runId,receipt));return previous;}
  // A result alone cannot admit an unknown or retired world.
  const admission=this.admissions.get(result.runId);
  if(!this.active)this.active={matchId:result.matchId,participantId:result.participantId,lifeId:result.lifeId,initialTerritoryCells:7,ownerId:this.ownerId};
  const pending=this.enqueue(()=>this.store.grant(result,admission,this.ownerId)).catch(()=>({status:'failed',reward:null,balance:0} as RewardReceipt)).then(receipt=>{this.show(result.runId,receipt);return receipt;});
  this.receipts.set(result.runId,pending);if(this.receipts.size>256)this.receipts.delete(this.receipts.keys().next().value!);return pending;
 }
 retire():void {const a=this.active;this.active=null;this.admissions.clear();this.attempted.clear();this.failures.clear();if(a)void this.enqueue(()=>this.store.closeWorld(a.matchId,a.participantId,a.ownerId)).catch(()=>{});}
}

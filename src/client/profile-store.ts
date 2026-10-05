import {emptyProfile,validProfile,admitRun,grantProfileReward,closeProfileWorld,type PlayerProfileV1,type RunAdmission,type RewardReceipt} from './profile.js';
import type {RunResult} from '../shared/model.js';
export const PROFILE_DATABASE='hexhold.player-profile',PROFILE_STORE='meta',PROFILE_KEY='profile';
function browserDatabase():IDBFactory|null{try{return typeof indexedDB==='undefined'?null:indexedDB;}catch{return null;}}
export class ProfileStore {
 private database:Promise<IDBDatabase>|null=null;private channel:BroadcastChannel|null=null;private listeners=new Set<(p:PlayerProfileV1)=>void>();
 constructor(private factory:IDBFactory|null|undefined=undefined,private name=PROFILE_DATABASE){try{if(typeof BroadcastChannel!=='undefined'){this.channel=new BroadcastChannel(name);this.channel.onmessage=()=>{void this.read().then(p=>this.publish(p,false)).catch(()=>{});};}}catch{}}
 private open():Promise<IDBDatabase>{
  if(this.database)return this.database;const factory=this.factory===undefined?browserDatabase():this.factory;if(!factory)return Promise.reject(new Error('Profile storage unavailable'));
  const attempt=new Promise<IDBDatabase>((resolve,reject)=>{let settled=false;const request=factory.open(this.name,1),timer=setTimeout(()=>{settled=true;reject(new Error('Profile storage timed out'));},4000);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(PROFILE_STORE))request.result.createObjectStore(PROFILE_STORE);};
   request.onerror=()=>{clearTimeout(timer);settled=true;reject(request.error??new Error('Profile storage error'));};request.onblocked=()=>{clearTimeout(timer);settled=true;reject(new Error('Profile storage blocked'));};
   request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;const db=request.result;db.onversionchange=()=>{db.close();this.database=null;};resolve(db);};
  });this.database=attempt;void attempt.catch(()=>{if(this.database===attempt)this.database=null;});return attempt;
 }
 private async transaction<T>(change:(p:PlayerProfileV1)=>T,announce=true):Promise<T>{
  const db=await this.open();return new Promise<T>((resolve,reject)=>{const tx=db.transaction(PROFILE_STORE,'readwrite'),store=tx.objectStore(PROFILE_STORE),get=store.get(PROFILE_KEY);let result:T,profile:PlayerProfileV1;let error:unknown;
   tx.oncomplete=()=>{if(announce)this.publish(profile);resolve(result);};tx.onabort=()=>reject(error??tx.error??new Error('Profile transaction aborted'));tx.onerror=()=>{};
   get.onsuccess=()=>{try{const saved=get.result;profile=validProfile(saved)?saved:emptyProfile();if(saved!==undefined&&!validProfile(saved))store.put(saved,'corrupt-backup');result=change(profile);if(!validProfile(profile))throw new Error('Invalid profile update');store.put(profile,PROFILE_KEY);}catch(e){error=e;tx.abort();}};
  });
 }
 read():Promise<PlayerProfileV1>{return this.transaction(p=>structuredClone(p),false);}
 admit(a:RunAdmission):Promise<boolean>{return this.transaction(p=>{for(const w of p.worlds)if(w.matchId!==a.matchId)for(const person of w.participants)if(person.ownerId===a.ownerId)person.closed=true;return admitRun(p,a);});}
 grant(r:RunResult,a?:RunAdmission,ownerId?:string):Promise<RewardReceipt>{return this.transaction(p=>{const ledger=p.worlds.find(w=>w.matchId===r.matchId)?.participants.find(p=>p.participantId===r.participantId);if(ownerId&&ledger&&!ledger.closed&&ledger.observedLifeId===r.lifeId)ledger.ownerId=ownerId;return grantProfileReward(p,r,a);});}
 closeWorld(matchId:string,participantId:string,ownerId:string):Promise<void>{return this.transaction(p=>closeProfileWorld(p,matchId,participantId,ownerId));}
 subscribe(listener:(p:PlayerProfileV1)=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 private publish(p:PlayerProfileV1,announce=true):void{for(const listener of this.listeners)listener(structuredClone(p));if(announce)this.channel?.postMessage('changed');}
 dispose():void{this.channel?.close();this.channel=null;this.listeners.clear();void this.database?.then(db=>db.close()).catch(()=>{});this.database=null;}
}

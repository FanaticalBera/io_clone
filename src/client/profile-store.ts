import {readProfileSnapshot} from './profile-snapshot.js';
import {profileTrace} from './profile-diagnostics.js';
import {claimTestMarker,hasTestMarkerGift,type TestMarkerGift} from './test-marker-gift.js';
import {purchaseItem,equipItem,type ShopReceipt} from './inventory.js';
import type {ProductKind} from './catalog.js';
import {emptyProfile,validProfile,migrateProfile,admitRun,grantProfileReward,closeProfileWorld,type PlayerProfileV1,type RunAdmission,type RewardReceipt} from './profile.js';
import type {RunResult} from '../shared/model.js';
export const PROFILE_TRANSACTION_TIMEOUT_MS=15000;
export const PROFILE_DATABASE='hexhold.player-profile',PROFILE_STORE='meta',PROFILE_KEY='profile';
function browserDatabase():IDBFactory|null{try{return typeof indexedDB==='undefined'?null:indexedDB;}catch{return null;}}
export class ProfileStore {
 private database:Promise<IDBDatabase>|null=null;private channel:BroadcastChannel|null=null;private listeners=new Set<(p:PlayerProfileV1)=>void>();
 constructor(private factory:IDBFactory|null|undefined=undefined,private name=PROFILE_DATABASE){try{if(typeof BroadcastChannel!=='undefined'){this.channel=new BroadcastChannel(name);this.channel.onmessage=()=>{void this.read().then(p=>this.publish(p,false)).catch(()=>{});};}}catch{}}
 private open():Promise<IDBDatabase>{
  if(this.database)return this.database;const factory=this.factory===undefined?browserDatabase():this.factory;if(!factory)return Promise.reject(new Error('Profile storage unavailable'));
  profileTrace('DB_OPEN '+this.name);const attempt=new Promise<IDBDatabase>((resolve,reject)=>{let settled=false;const request=factory.open(this.name,1),timer=setTimeout(()=>{settled=true;profileTrace('DB_OPEN_TIMEOUT '+this.name);reject(new Error('Profile storage timed out'));},4000);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(PROFILE_STORE))request.result.createObjectStore(PROFILE_STORE);};
   request.onerror=()=>{clearTimeout(timer);settled=true;profileTrace('DB_OPEN_ERROR '+this.name,request.error);reject(request.error??new Error('Profile storage error'));};request.onblocked=()=>{clearTimeout(timer);settled=true;profileTrace('DB_OPEN_BLOCKED '+this.name);reject(new Error('Profile storage blocked'));};
   request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;profileTrace('DB_OPEN_OK '+this.name);const db=request.result;db.onversionchange=()=>{db.close();this.database=null;};db.onclose=()=>{if(this.database===attempt)this.database=null;};resolve(db);};
  });this.database=attempt;void attempt.catch(()=>{if(this.database===attempt)this.database=null;});return attempt;
 }
 private async transaction<T>(change:(p:PlayerProfileV1,saved?:unknown)=>T,announce=true,operation='save',mode:IDBTransactionMode='readwrite'):Promise<T>{
  const db=await this.open();profileTrace('TX_START '+operation+' '+mode);return new Promise<T>((resolve,reject)=>{const tx=db.transaction(PROFILE_STORE,mode),store=tx.objectStore(PROFILE_STORE),get=store.get(PROFILE_KEY);let result:T,profile:PlayerProfileV1;let error:unknown,phase='GET';
   const timer=setTimeout(()=>{
    error=new Error('Profile transaction timed out at '+phase);profileTrace('TX_TIMEOUT '+operation,error);
    // A successful abort rolls back the entire transaction before allowing retry.
    // If it already finished, its completion/abort event remains authoritative.
    try{tx.abort();reject(error);}catch{}
   },PROFILE_TRANSACTION_TIMEOUT_MS);
   tx.oncomplete=()=>{clearTimeout(timer);profileTrace('TX_COMMIT '+operation);resolve(result);if(announce)this.publish(profile);};
   tx.onabort=()=>{clearTimeout(timer);profileTrace('TX_ABORT '+operation,error??tx.error);reject(error??tx.error??new Error('Profile transaction aborted'));};tx.onerror=()=>{};
   get.onsuccess=()=>{
    profileTrace('TX_GET_OK '+operation);phase='MIGRATE';
    try{
     const saved=get.result,migrated=migrateProfile(saved);profile=migrated??emptyProfile();
     if(mode==='readwrite'&&saved!==undefined&&!migrated)store.put(saved,'corrupt-backup');
     phase='CHANGE';result=change(profile,saved);if(!validProfile(profile))throw new Error('Invalid profile update');
     phase='COMMIT';
     if(mode==='readwrite'){
      phase='PUT';const put=store.put(profile,PROFILE_KEY);
      put.onsuccess=()=>{phase='COMMIT';profileTrace('TX_PUT_OK '+operation);};
     }
    }catch(e){error=e;profileTrace('TX_CALLBACK_ERROR '+operation+' '+phase,e);tx.abort();}
   };
  });
 }
 readForDisplay():Promise<PlayerProfileV1>{
  const factory=this.factory===undefined?browserDatabase():this.factory;
  return factory?readProfileSnapshot(factory,this.name,PROFILE_STORE,PROFILE_KEY,PROFILE_TRANSACTION_TIMEOUT_MS):Promise.reject(new Error('Profile storage unavailable'));
 }
 async read():Promise<PlayerProfileV1>{
  const read=await this.transaction((p,saved)=>({profile:structuredClone(p),needsMigration:!validProfile(saved)}),false,'read','readonly');
  // Persist initialization/repair only when needed, re-reading atomically so a
  // concurrent purchase or reward can never be overwritten by this earlier read.
  return read.needsMigration?this.transaction(p=>structuredClone(p),false,'migrate'):read.profile;
 }
 admit(a:RunAdmission):Promise<boolean>{return this.transaction(p=>{for(const w of p.worlds)if(w.matchId!==a.matchId)for(const person of w.participants)if(person.ownerId===a.ownerId)person.closed=true;return admitRun(p,a);},true,'admit');}
 grant(r:RunResult,a?:RunAdmission,ownerId?:string):Promise<RewardReceipt>{return this.transaction(p=>{const ledger=p.worlds.find(w=>w.matchId===r.matchId)?.participants.find(p=>p.participantId===r.participantId);if(ownerId&&ledger&&!ledger.closed&&ledger.observedLifeId===r.lifeId)ledger.ownerId=ownerId;return grantProfileReward(p,r,a);},true,'reward');}
 purchase(kind:ProductKind,id:string):Promise<ShopReceipt>{return this.transaction(p=>purchaseItem(p,kind,id),true,'purchase');}
 equip(kind:ProductKind,id:string):Promise<ShopReceipt>{return this.transaction(p=>equipItem(p,kind,id),true,'equip');}
 async claimTestMarker(gift:TestMarkerGift='cat'):Promise<PlayerProfileV1>{
  const current=await this.read();
  if(hasTestMarkerGift(current,gift)){profileTrace('GIFT_ALREADY_GRANTED');return current;}
  return this.transaction(p=>{claimTestMarker(p,gift);return structuredClone(p);},true,'marker-gift');
 }
 closeWorld(matchId:string,participantId:string,ownerId:string):Promise<void>{return this.transaction(p=>closeProfileWorld(p,matchId,participantId,ownerId),true,'close-world');}
 subscribe(listener:(p:PlayerProfileV1)=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 private publish(p:PlayerProfileV1,announce=true):void{
  // Notifications run after commit and must never keep a committed save pending.
  for(const listener of this.listeners)try{listener(structuredClone(p));}catch(error){profileTrace('PROFILE_LISTENER_ERROR',error);console.warn('Profile listener notification failed',error);}
  if(announce)try{this.channel?.postMessage('changed');}catch(error){profileTrace('PROFILE_CHANNEL_ERROR',error);console.warn('Profile tab notification failed',error);}
 }
 dispose():void{this.channel?.close();this.channel=null;this.listeners.clear();void this.database?.then(db=>db.close()).catch(()=>{});this.database=null;}
}

import {emptyProfile,migrateProfile,type PlayerProfileV1} from './profile.js';
// A display lookup never initializes, repairs or writes the stored profile.
export function readProfileSnapshot(factory:IDBFactory,name:string,storeName:string,key:string,transactionTimeout:number):Promise<PlayerProfileV1>{
 return new Promise((resolve,reject)=>{
  let db:IDBDatabase|undefined,tx:IDBTransaction|undefined,finished=false,absent=false,profile:PlayerProfileV1;
  let timer=setTimeout(()=>finish(undefined,new Error('Profile storage timed out')),4000);
  function finish(value?:PlayerProfileV1,error?:unknown):void {
   if(finished)return;finished=true;clearTimeout(timer);if(error)try{tx?.abort();}catch{}db?.close();if(error)reject(error);else resolve(value!);
  }
  try{
   const open=factory.open(name);
   open.onupgradeneeded=()=>{absent=true;open.transaction?.abort();};
   open.onerror=()=>absent?finish(emptyProfile()):finish(undefined,open.error??new Error('Profile storage error'));
   open.onblocked=()=>finish(undefined,new Error('Profile storage blocked'));
   open.onsuccess=()=>{
    db=open.result;if(finished){db.close();return;}
    try{
     if(!db.objectStoreNames.contains(storeName))throw new Error('Profile store missing');
     clearTimeout(timer);timer=setTimeout(()=>finish(undefined,new Error('Profile read timed out')),transactionTimeout);
     tx=db.transaction(storeName,'readonly');const get=tx.objectStore(storeName).get(key);
     get.onsuccess=()=>{if(finished)return;try{profile=get.result===undefined?emptyProfile():migrateProfile(get.result)!;if(!profile)throw new Error('Invalid saved profile');}catch(error){finish(undefined,error);}};
     get.onerror=()=>finish(undefined,get.error??new Error('Profile read error'));
     tx.oncomplete=()=>finish(profile);tx.onabort=()=>finish(undefined,tx?.error??new Error('Profile read aborted'));
    }catch(error){finish(undefined,error);}
   };
  }catch(error){finish(undefined,error);}
 });
}

import {PROTOCOL_VERSION} from '../../src/shared/config.js';
import {io,type Socket} from 'socket.io-client';
import {createGameServer,type ServerOptions} from '../../src/server/app.js';
import type {SessionReady,Ack,RoomView,WireSnapshot} from '../../src/shared/protocol.js';
export async function serverFixture(options:ServerOptions={}){
 const server=createGameServer({...options,config:{mapRadius:22,maxSlots:8,spawnRadius:2,...options.config}});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));
 const address=server.http.address() as {port:number},url='http://127.0.0.1:'+address.port,clients:Socket[]=[];
 async function client(auth:Record<string,unknown>={protocolVersion:PROTOCOL_VERSION},transports?:string[]){
  const socket=io(url,{auth,autoConnect:false,reconnection:false,transports});clients.push(socket);
  const views:RoomView[]=[],snapshots:WireSnapshot[]=[];socket.on('room:view',v=>views.push(v));socket.on('match:init',v=>snapshots.push(v));socket.on('match:snapshot',v=>snapshots.push(v));
  const ready=await new Promise<SessionReady>((resolve,reject)=>{socket.once('session:ready',resolve);socket.once('connect_error',reject);socket.connect();});
  return{socket,ready,views,snapshots,request:(event:string,data:Record<string,unknown>={})=>new Promise<Ack>((resolve,reject)=>socket.timeout(3000).emit(event,{requestId:crypto.randomUUID(),...data},(error:Error|null,response:Ack)=>error?reject(error):resolve(response)))};
 }
 return{...server,url,client,close:async()=>{for(const c of clients)c.disconnect();await server.close();}};
}
export async function until(condition:()=>boolean,timeout=5000):Promise<void>{
 const start=performance.now();while(!condition()){if(performance.now()-start>timeout)throw new Error('Timed out');await new Promise(r=>setTimeout(r,10));}
}

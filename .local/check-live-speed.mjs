import {io} from 'socket.io-client';
import {PROTOCOL_VERSION} from '../dist/server/shared/config.js';
const url='http://192.168.137.1:3003';
const socket=io(url,{transports:['websocket'],extraHeaders:{Origin:url},auth:{protocolVersion:PROTOCOL_VERSION},reconnection:false,autoConnect:false});
let joined=false;
const command=(event,body={})=>new Promise((resolve,reject)=>socket.timeout(5000).emit(event,{requestId:crypto.randomUUID(),...body},(error,response)=>error?reject(error):response.ok?resolve(response):reject(new Error(JSON.stringify(response)))));
try {
 await new Promise((resolve,reject)=>{socket.once('session:ready',resolve);socket.once('connect_error',reject);socket.connect();});
 const snapshot=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No live snapshot')),10000);socket.on('match:snapshot',view=>{clearTimeout(timer);resolve(view);});});
 await command('room:create',{nickname:'조작검증',gameMode:'classic'});joined=true;
 await command('room:start');
 const view=await snapshot;
 const self=view.participants.find(p=>p.participantId===view.selfParticipantId),target={x:-self.direction.y,y:self.direction.x};
 const turning=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No steering snapshot')),3000);socket.on('match:snapshot',next=>{const p=next.participants.find(p=>p.participantId===next.selfParticipantId);if(p.lastAppliedInputSeq===1){clearTimeout(timer);resolve(p);}});});
 socket.emit('input:direction',{matchId:view.matchId,lifeId:self.lifeId,seq:1,dx:target.x,dy:target.y});
 const p=await turning;
 if(p.direction.x===target.x&&p.direction.y===target.y)throw new Error('First steering snapshot jumped to target');
 console.log(JSON.stringify({url,protocolVersion:view.protocolVersion,moveCellsPerSecond:view.config.moveCellsPerSecond,turnRadiansPerSecond:view.config.turnRadiansPerSecond,initial:self.direction,target,actual:p.direction,ack:p.lastAppliedInputSeq,matchId:view.matchId}));
} finally {
 if(joined)await command('room:leave');socket.disconnect();
}

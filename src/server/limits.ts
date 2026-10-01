import type {Session,GameSocket} from './sessions.js';
import type {Ack} from '../shared/protocol.js';
const limited:Ack={ok:false,code:'RATE_LIMITED',message:'요청이 너무 많아요. 잠시 후 다시 시도하세요.'};
export class Limits {
 private ips=new Map<string,number[]>();
 constructor(private now:()=>number,private log:(event:string,fields:Record<string,unknown>)=>void=()=>{}){}
 direction(session:Session,socket:GameSocket):boolean{
  const now=this.now(),elapsed=Math.max(0,now-session.inputRefillAt);session.inputRefillAt=now;
  session.inputTokens=Math.min(60,session.inputTokens+elapsed*0.03);
  if(session.inputTokens>=1){session.inputTokens--;return true;}
  session.inputViolations++;if(session.inputViolations===1||session.inputViolations===60)this.log('input_limited',{count:session.inputViolations});
  if(session.inputViolations>=60)socket.disconnect(true);return false;
 }
 request(session:Session,event:string,ip:string,createsRoom:boolean,action:()=>Ack):Ack{
  if(event==='room:leave'||event.startsWith('control:'))return action();
  const now=this.now();session.requestTimes=session.requestTimes.filter(t=>now-t<10000);
  if(session.requestTimes.length>=5)return {...limited};session.requestTimes.push(now);
  session.codeFailures=session.codeFailures.filter(t=>now-t<60000);
  if(event==='room:join'&&session.codeFailures.length>=10)return {...limited};
  for(const [key,times] of this.ips){const current=times.filter(t=>now-t<60000);if(current.length)this.ips.set(key,current);else this.ips.delete(key);}
  if(createsRoom){const times=this.ips.get(ip)??[];if(times.length>=3)return {...limited};times.push(now);this.ips.set(ip,times);}
  const result=action();if(event==='room:join'&&!result.ok&&result.code==='ROOM_NOT_FOUND')session.codeFailures.push(now);return result;
 }
}
export function allowedOrigin(origin:string|undefined,host:string|undefined,origins:readonly string[]):boolean{
 if(!origin)return true;
 try{const url=new URL(origin);if(url.origin!==origin||!['http:','https:'].includes(url.protocol))return false;
 return url.host===host||origins.includes(origin);
 }catch{return false;}
}
export function validateOrigins(origins:readonly string[]):void{
 for(const origin of origins){try{const url=new URL(origin);if(url.origin===origin&&['http:','https:'].includes(url.protocol))continue;}catch{}throw new Error('Invalid ALLOWED_ORIGINS');}
}

import {record} from './protocol.js';
// LAN wire format (PRD 10.2): one JSON object per frame, carried by the native TCP plugin or an in-memory channel.
//   {k:'req',id,e,d}  command expecting an ack     {k:'ack',id,d}  reply to req `id`     {k:'evt',e,d}  fire-and-forget event
export type Frame={k:'req';id:number;e:string;d:unknown}|{k:'ack';id:number;d:unknown}|{k:'evt';e:string;d:unknown};
export const LAN_MAX_HUMANS=4;
export const LAN_HEARTBEAT_MS=1000,LAN_HEARTBEAT_TIMEOUT_MS=5000,LAN_REQUEST_TIMEOUT_MS=3000;
/** A guest may step away (background, lost Wi-Fi) this long; a bot steers them home meanwhile, then takes the slot. */
export const LAN_AWAY_GRACE_MS=30000;
/** The host phone may leave the app this long; the room stays frozen for everyone meanwhile. */
export const LAN_HOST_PAUSE_MS=60000;
export function encodeFrame(frame:Frame):string {return JSON.stringify(frame);}
export function decodeFrame(raw:string):Frame|null {
 let value:unknown;try{value=JSON.parse(raw);}catch{return null;}
 if(!record(value))return null;
 const id=value.id,e=value.e;
 if(value.k==='req'&&Number.isSafeInteger(id)&&Number(id)>0&&typeof e==='string'&&e.length<=64)return{k:'req',id:Number(id),e,d:value.d};
 if(value.k==='ack'&&Number.isSafeInteger(id)&&Number(id)>0)return{k:'ack',id:Number(id),d:value.d};
 if(value.k==='evt'&&typeof e==='string'&&e.length<=64)return{k:'evt',e,d:value.d};
 return null;
}

/**
 * A bidirectional, ordered frame pipe. `replaceKey` marks a frame the sender may coalesce with a newer one (PRD 7.3).
 * Like the native plugin, the far end only learns REMOTE_CLOSED; a reason worth showing travels as an app:error frame first.
 */
export interface FrameChannel {
 send(data:string,options?:{replaceKey?:string}):void;
 close(reason:string):void;
 onMessage(handler:(data:string)=>void):void;
 onClose(handler:(reason:string)=>void):void;
}

export interface MemoryChannelOptions {
 /** One-way delay per frame. 0 still delivers asynchronously, like a real socket. */
 latencyMs?:number;
 /** Probability that a replaceable frame is dropped, standing in for queue-tail replacement under load. */
 dropReplaceable?:number;
 random?:()=>number;
}
/** Two connected in-memory channel ends: the host's own loopback, and the test transport. */
export function createChannelPair(options:MemoryChannelOptions={}):[FrameChannel,FrameChannel] {
 const random=options.random??Math.random,latency=options.latencyMs??0;
 type End={messages:((data:string)=>void)[];closes:((reason:string)=>void)[];backlog:string[];closed:boolean;peer:End|null};
 const make=():End=>({messages:[],closes:[],backlog:[],closed:false,peer:null});
 const a=make(),b=make();a.peer=b;b.peer=a;
 const deliver=(to:End,data:string)=>{if(to.closed)return;if(to.messages.length)for(const h of to.messages)h(data);else to.backlog.push(data);};
 const shut=(end:End,reason:string)=>{if(end.closed)return;end.closed=true;for(const h of end.closes)h(reason);};
 const later=(fn:()=>void)=>latency>0?setTimeout(fn,latency):queueMicrotask(fn);
 const channel=(self:End):FrameChannel=>({
  send:(data,opts)=>{if(self.closed)return;if(opts?.replaceKey&&random()<(options.dropReplaceable??0))return;const to=self.peer!;later(()=>deliver(to,data));},
  close:()=>{if(self.closed)return;const to=self.peer!;shut(self,'LOCAL_CLOSE');later(()=>shut(to,'REMOTE_CLOSED'));},
  onMessage:h=>{self.messages.push(h);const pending=self.backlog.splice(0);for(const d of pending)h(d);},
  onClose:h=>{self.closes.push(h);}
 });
 return [channel(a),channel(b)];
}

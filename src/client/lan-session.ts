import {Capacitor} from '@capacitor/core';
import {LanSocket} from './lan-socket.js';
import {FrameTransport} from './transport.js';
import {LanHost} from '../shared/lan-host.js';
import {createChannelPair,type FrameChannel} from '../shared/lan-protocol.js';
import {encodeLanCode,decodeLanCode,LAN_BASE_PORT,LAN_PORT_SLOTS} from '../shared/lan-code.js';
import type {AppError} from '../shared/protocol.js';
// Friend match without a server (PRD 4): the APK hosts the room on this phone or joins another phone by code.
// Everything above the transport (NetworkSession, UI, renderer, rewards) is the same as online play.
export const lanAvailable=():boolean=>Capacitor.isNativePlatform();

class LanFailure extends Error {}

// One plugin listener pair fans native events out to per-connection channels.
const channels=new Map<string,{message:(data:string)=>void;close:(reason:string)=>void}>();
let listening=false;
function listenOnce():void {
 if(listening)return;listening=true;
 void LanSocket.addListener('message',e=>channels.get(e.connectionId)?.message(e.data));
 void LanSocket.addListener('close',e=>{console.info('[lan] connection closed',e.connectionId,e.reason);const c=channels.get(e.connectionId);channels.delete(e.connectionId);c?.close(e.reason);});
}
function nativeChannel(connectionId:string):FrameChannel {
 const messages:((data:string)=>void)[]=[],closes:((reason:string)=>void)[]=[],backlog:string[]=[];let closed=false;
 channels.set(connectionId,{
  message:data=>{if(messages.length)for(const h of messages)h(data);else backlog.push(data);},
  close:reason=>{if(closed)return;closed=true;for(const h of closes)h(reason);}
 });
 return{
  send:(data,options)=>{if(!closed)void LanSocket.send({connectionId,data,replaceable:!!options?.replaceKey,...(options?.replaceKey?{replaceKey:options.replaceKey}:{})}).catch(()=>{});},
  close:()=>{if(closed)return;closed=true;channels.delete(connectionId);void LanSocket.disconnect({connectionId}).catch(()=>{});for(const h of closes)h('LOCAL_CLOSE');},
  onMessage:h=>{messages.push(h);for(const d of backlog.splice(0))h(d);},
  onClose:h=>{closes.push(h);}
 };
}

export interface LanHosting {
 transport:FrameTransport;code:string;close():void;
 /** App to background: freeze the room for guests. */pause():void;
 /** Back to foreground: false when the host was gone too long and the room has ended. */resume():boolean;
}
/**
 * Opens the room on this phone: picks the one LAN address, listens on it, checks it can reach itself (PRD 6.4),
 * then serves guests and the host's own client (over a loopback channel) from one LanHost.
 */
export async function hostLan(onClosed:(error:AppError)=>void):Promise<LanHosting> {
 listenOnce();
 const listen=await LanSocket.listen({basePort:LAN_BASE_PORT,slots:LAN_PORT_SLOTS}).catch(()=>{throw new LanFailure('방을 열지 못했어요. 잠시 후 다시 시도해 주세요.');});
 if(!listen.address){
  await LanSocket.closeServer().catch(()=>{});
  throw new LanFailure(listen.addressError==='AMBIGUOUS_ADDRESS'?'이 기기는 네트워크가 여러 개라 방 주소를 정하지 못했어요. 다른 친구가 방을 만들어 주세요.':'Wi-Fi 또는 핫스팟에 연결한 뒤 다시 시도해 주세요.');
 }
 try{const self=await LanSocket.connect({address:listen.address,port:listen.port,timeoutMs:3000});await LanSocket.disconnect({connectionId:self.connectionId});}
 catch{await LanSocket.closeServer().catch(()=>{});throw new LanFailure('이 기기에서 방 주소를 확인하지 못했어요. 다른 친구가 방을 만들어 주세요.');}
 const code=encodeLanCode(listen.address,listen.slot);
 let closed=false;
 const close=()=>{if(closed)return;closed=true;host.shutdown();void connection.then(h=>h.remove());void LanSocket.closeServer().catch(()=>{});};
 // LAN events go to logcat (chromium Console) for diagnosing real-device sessions; no personal data is logged.
 const host=new LanHost({code,log:(event,fields)=>console.info('[lan] '+event,JSON.stringify(fields)),onClosed:error=>{if(!closed){close();onClosed(error);}}});
 const connection=LanSocket.addListener('connection',e=>host.attach(nativeChannel(e.connectionId)));
 const [hostEnd,clientEnd]=createChannelPair();host.attach(hostEnd,{local:true});
 const resume=()=>{const ok=host.resume();if(ok)void LanSocket.ensureListening().then(r=>{if(r.reopened)console.info('[lan] listener reopened');}).catch(()=>{});return ok;};
 return{transport:new FrameTransport(clientEnd),code,close,pause:()=>host.pause(),resume};
}

/** Decodes the code and connects to the host phone. Typos fail here, before any network wait (PRD 6.1). */
export async function joinLan(rawCode:string):Promise<FrameTransport> {
 const decoded=decodeLanCode(rawCode);
 if(!decoded.ok)throw new LanFailure(decoded.reason==='FORMAT'?'방 코드는 8자리예요.':'방 코드를 다시 확인해 주세요.');
 listenOnce();
 const open=async(timeoutMs:number)=>nativeChannel((await LanSocket.connect({address:decoded.address,port:decoded.port,timeoutMs})).connectionId);
 let first:FrameChannel;
 try{first=await open(10000);}catch{throw new LanFailure('방에 연결하지 못했어요. 같은 Wi-Fi 또는 핫스팟인지 확인해 주세요.');}
 // A dropped connection (Wi-Fi blip, app in background) comes back to the same seat while the host holds it.
 return new FrameTransport(first,{reconnect:()=>open(3000),waitForForeground:()=>document.hidden});
}

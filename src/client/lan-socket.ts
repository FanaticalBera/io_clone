import {registerPlugin,type PluginListenerHandle} from '@capacitor/core';
// Typed bridge to android/app/src/main/java/com/hexhold/game/LanSocketPlugin.java. It only moves frames; no game state lives natively.
export interface AddressCandidate {interface:string|null;address:string;kind:'WIFI_CLIENT'|'HOTSPOT_OR_LAN'|'EXCLUDED';eligible:boolean}
export interface AddressSelection {address:string|null;error:'NO_ADDRESS'|'AMBIGUOUS_ADDRESS'|null;candidates:AddressCandidate[]}
export interface ListenResult {port:number;slot:number;address:string|null;addressError:AddressSelection['error'];candidates:AddressCandidate[]}
export interface ConnectionStats {queueLength:number;queuedBytes:number;queueAgeMs:number;maxQueueLength:number;maxQueueAgeMs:number;replacedFrames:number;sentFrames:number;sentBytes:number;receivedFrames:number;receivedBytes:number;boundToWifi:boolean}
export interface DeviceInfo {model:string;manufacturer:string;release:string;sdk:number;webView:string|null}
export interface LanSocketPlugin {
 info():Promise<DeviceInfo>;
 addressCandidates():Promise<AddressSelection>;
 listen(options:{basePort:number;slots:number}):Promise<ListenResult>;
 closeServer():Promise<void>;
 /** Re-binds the last listener (same address and port, so the room code stays valid) if it is no longer open. */
 ensureListening():Promise<{reopened:boolean}>;
 connect(options:{address:string;port:number;timeoutMs:number}):Promise<{connectionId:string;boundToWifi:boolean}>;
 // replaceable frames with the same replaceKey replace only the not-yet-written queue tail (PRD 7.3).
 send(options:{connectionId:string;data:string;replaceable?:boolean;replaceKey?:string}):Promise<void>;
 disconnect(options:{connectionId:string}):Promise<void>;
 stats(options:{connectionId:string}):Promise<ConnectionStats>;
 addListener(event:'connection',handler:(e:{connectionId:string;remote:string})=>void):Promise<PluginListenerHandle>;
 addListener(event:'message',handler:(e:{connectionId:string;data:string})=>void):Promise<PluginListenerHandle>;
 addListener(event:'close',handler:(e:{connectionId:string;reason:string})=>void):Promise<PluginListenerHandle>;
 removeAllListeners():Promise<void>;
}
export const LanSocket=registerPlugin<LanSocketPlugin>('LanSocket');

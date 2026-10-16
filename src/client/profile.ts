import {defaultInventory,normalizeInventory,validInventory,type PlayerInventory} from './inventory.js';
import type {RunResult} from '../shared/model.js';
import {calculateReward,validateRewardRun,type RewardResult} from './reward.js';
import {MAP_PRESETS,presetForCellCount} from '../shared/map-presets.js';
export const PROFILE_HISTORY_LIMIT=256,PROFILE_WORLD_LIMIT=32;
export interface RunAdmission {matchId:string;participantId:string;lifeId:number;initialTerritoryCells:number;ownerId:string}
export interface ParticipantLedger {participantId:string;observedLifeId:number;paidLifeId:number;initialTerritoryCells:number;ownerId:string;closed:boolean}
export interface WorldLedger {matchId:string;participants:ParticipantLedger[]}
/** Best territory, classic clears, runs, kills and longest run on one board preset (kills/longest added later, so optional). */
export interface MapRecord {best:number;clears:number;runs:number;kills?:number;longest?:number;topKills?:number;fastest?:number}
/** Records a granted run broke on its board (same board, strictly better; never on its first run there). */
export interface RunRecords {best?:true;longest?:true;kills?:true;fastest?:true}
export interface PlayerProfileV1 {version:1;inventory:PlayerInventory;coins:number;stats:{runsPlayed:number;classicClears:number;totalKills:number;bestTerritoryPercent:number;longestRunSeconds:number;maps?:Record<string,MapRecord>;lastMap?:string};processedRuns:RewardResult[];worlds:WorldLedger[]}
export interface RewardReceipt {status:'granted'|'duplicate'|'ignored'|'failed';reward:RewardResult|null;balance:number;records?:RunRecords}
export function emptyProfile():PlayerProfileV1{return{version:1,inventory:defaultInventory(),coins:0,stats:{runsPlayed:0,classicClears:0,totalKills:0,bestTerritoryPercent:0,longestRunSeconds:0,maps:{}},processedRuns:[],worlds:[]};}
const safe=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const text=(v:unknown,max=128):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const MAP_IDS=new Set<string>(MAP_PRESETS.map(p=>p.id));
const percent=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;
function validMaps(stats:Record<string,unknown>):boolean{
 if(stats.lastMap!==undefined&&!(typeof stats.lastMap==='string'&&MAP_IDS.has(stats.lastMap)))return false;
 if(stats.maps===undefined)return true;if(!object(stats.maps))return false;
 return Object.entries(stats.maps).every(([id,r])=>MAP_IDS.has(id)&&object(r)&&percent(r.best)&&safe(r.clears)&&safe(r.runs)&&(r.kills===undefined||safe(r.kills))&&(r.topKills===undefined||safe(r.topKills))&&[r.longest,r.fastest].every(v=>v===undefined||(typeof v==='number'&&Number.isFinite(v)&&v>=0)));
}
function validProfileBase(value:unknown):value is Omit<PlayerProfileV1,'inventory'> {
 if(!object(value)||value.version!==1||!safe(value.coins)||!object(value.stats)||!['runsPlayed','classicClears','totalKills'].every(k=>safe((value.stats as Record<string,unknown>)[k]))||typeof value.stats.bestTerritoryPercent!=='number'||!Number.isFinite(value.stats.bestTerritoryPercent)||value.stats.bestTerritoryPercent<0||value.stats.bestTerritoryPercent>100||typeof value.stats.longestRunSeconds!=='number'||!Number.isFinite(value.stats.longestRunSeconds)||value.stats.longestRunSeconds<0||!validMaps(value.stats)||
 !Array.isArray(value.processedRuns)||value.processedRuns.length>PROFILE_HISTORY_LIMIT||!Array.isArray(value.worlds)||value.worlds.length>PROFILE_WORLD_LIMIT)return false;
 const runs=new Set<string>(),worlds=new Set<string>();
 for(const r of value.processedRuns){if(!object(r)||!text(r.runId,320)||runs.has(r.runId)||!['baseCoins','territoryCoins','killCoins','clearBonusCoins','totalCoins'].every(k=>safe(r[k]))||r.totalCoins!==Number(r.baseCoins)+Number(r.territoryCoins)+Number(r.killCoins)+Number(r.clearBonusCoins))return false;runs.add(r.runId);}
 for(const w of value.worlds){if(!object(w)||!text(w.matchId)||worlds.has(w.matchId)||!Array.isArray(w.participants)||!w.participants.length||w.participants.length>16)return false;worlds.add(w.matchId);const people=new Set<string>();
  for(const p of w.participants){if(!object(p)||!text(p.participantId)||people.has(p.participantId)||!safe(p.observedLifeId)||p.observedLifeId<1||!safe(p.paidLifeId)||p.paidLifeId>p.observedLifeId||!safe(p.initialTerritoryCells)||p.initialTerritoryCells<1||!text(p.ownerId)||typeof p.closed!=='boolean')return false;people.add(p.participantId);}
 }return true;
}
export function validProfile(value:unknown):value is PlayerProfileV1 {return validProfileBase(value)&&validInventory((value as Record<string,unknown>).inventory);}
export function migrateProfile(value:unknown):PlayerProfileV1|null {
 // Add only Inventory to a valid legacy wallet. Version 1 stays readable by older reward clients.
 if(!validProfileBase(value))return null;
 const profile={...structuredClone(value),inventory:normalizeInventory((value as Record<string,unknown>).inventory)} as PlayerProfileV1;
 // Records from before per-map stats were almost all on the hexagon, so they become its record.
 if(!profile.stats.maps){const s=profile.stats;profile.stats.maps=s.runsPlayed?{hex:{best:s.bestTerritoryPercent,clears:s.classicClears,runs:s.runsPlayed,kills:s.totalKills,longest:s.longestRunSeconds}}:{};}
 return profile;
}
export function admitRun(profile:PlayerProfileV1,a:RunAdmission):boolean {
 if(!text(a.matchId)||!text(a.participantId)||!text(a.ownerId)||!safe(a.lifeId)||a.lifeId<1||!safe(a.initialTerritoryCells)||a.initialTerritoryCells<1)throw new Error('Invalid Run admission');
 let world=profile.worlds.find(w=>w.matchId===a.matchId);
 if(!world){if(profile.worlds.length>=PROFILE_WORLD_LIMIT){const old=profile.worlds.findIndex(w=>w.participants.every(p=>p.closed));if(old<0)throw new Error('Active world ledger is full');profile.worlds.splice(old,1);}world={matchId:a.matchId,participants:[]};profile.worlds.push(world);}
 let p=world.participants.find(p=>p.participantId===a.participantId);if(p?.closed)return false;
 if(!p){if(world.participants.length>=16)throw new Error('Participant ledger is full');p={participantId:a.participantId,observedLifeId:a.lifeId,paidLifeId:0,initialTerritoryCells:a.initialTerritoryCells,ownerId:a.ownerId,closed:false};world.participants.push(p);}
 if(a.lifeId<p.observedLifeId)return false;p.observedLifeId=a.lifeId;p.ownerId=a.ownerId;return true;
}
export function closeProfileWorld(profile:PlayerProfileV1,matchId:string,participantId:string,ownerId:string):void {const p=profile.worlds.find(w=>w.matchId===matchId)?.participants.find(p=>p.participantId===participantId);if(p?.ownerId===ownerId)p.closed=true;}
export function grantProfileReward(profile:PlayerProfileV1,result:RunResult,admission?:RunAdmission):RewardReceipt {
 validateRewardRun(result);const previous=profile.processedRuns.find(r=>r.runId===result.runId);if(previous)return{status:'duplicate',reward:{...previous},balance:profile.coins};
 if(admission&&admission.matchId===result.matchId&&admission.participantId===result.participantId&&admission.lifeId===result.lifeId)admitRun(profile,admission);
 const p=profile.worlds.find(w=>w.matchId===result.matchId)?.participants.find(p=>p.participantId===result.participantId);
 if(p&&result.lifeId<=p.paidLifeId)return{status:'duplicate',reward:null,balance:profile.coins};
 if(!p||p.closed||result.lifeId!==p.observedLifeId)return{status:'ignored',reward:null,balance:profile.coins};
 const reward=calculateReward(result,p.initialTerritoryCells),coins=profile.coins+reward.totalCoins,kills=profile.stats.totalKills+result.kills,runs=profile.stats.runsPlayed+1,clears=profile.stats.classicClears+Number(result.endReason==='FULL_CAPTURE_WIN');
 if(![coins,kills,runs,clears].every(safe))throw new Error('Profile integer overflow');
 const timed=result.endReason==='TIME_WIN'||result.endReason==='TIME_LOSS',mapId=timed?null:presetForCellCount(result.mapCellCount),maps={...(profile.stats.maps??{})};
 const seconds=result.durationTicks/result.simulationHz,win=result.endReason==='FULL_CAPTURE_WIN',records:RunRecords={};
 if(mapId){const r=maps[mapId]??{best:0,clears:0,runs:0},mapKills=(r.kills??0)+result.kills;if(!safe(mapKills))throw new Error('Profile integer overflow');
  if(r.runs>0){if(result.bestTerritoryPercent>r.best)records.best=true;if(r.topKills!==undefined&&result.kills>r.topKills)records.kills=true;
   if(win){if(r.fastest!==undefined&&seconds<r.fastest)records.fastest=true;}else if(r.longest!==undefined&&seconds>r.longest)records.longest=true;}
  maps[mapId]={best:Math.max(r.best,result.bestTerritoryPercent),clears:r.clears+Number(win),runs:r.runs+1,kills:mapKills,longest:Math.max(r.longest??0,seconds),topKills:Math.max(r.topKills??0,result.kills),...(win||r.fastest!==undefined?{fastest:Math.min(r.fastest??Infinity,win?seconds:Infinity)}:{})};}
 profile.coins=coins;profile.stats={runsPlayed:runs,classicClears:clears,totalKills:kills,bestTerritoryPercent:Math.max(profile.stats.bestTerritoryPercent,result.bestTerritoryPercent),longestRunSeconds:Math.max(profile.stats.longestRunSeconds,result.durationTicks/result.simulationHz),maps,...(mapId?{lastMap:mapId}:profile.stats.lastMap?{lastMap:profile.stats.lastMap}:{})};
 p.paidLifeId=result.lifeId;profile.processedRuns.push(reward);if(profile.processedRuns.length>PROFILE_HISTORY_LIMIT)profile.processedRuns.splice(0,profile.processedRuns.length-PROFILE_HISTORY_LIMIT);
 return{status:'granted',reward:{...reward},balance:profile.coins,...(Object.keys(records).length?{records}:{})};
}

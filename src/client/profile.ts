import type {RunResult} from '../shared/model.js';
import {calculateReward,validateRewardRun,type RewardResult} from './reward.js';
export const PROFILE_HISTORY_LIMIT=256,PROFILE_WORLD_LIMIT=32;
export interface RunAdmission {matchId:string;participantId:string;lifeId:number;initialTerritoryCells:number;ownerId:string}
export interface ParticipantLedger {participantId:string;observedLifeId:number;paidLifeId:number;initialTerritoryCells:number;ownerId:string;closed:boolean}
export interface WorldLedger {matchId:string;participants:ParticipantLedger[]}
export interface PlayerProfileV1 {version:1;coins:number;stats:{runsPlayed:number;classicClears:number;totalKills:number;bestTerritoryPercent:number;longestRunSeconds:number};processedRuns:RewardResult[];worlds:WorldLedger[]}
export interface RewardReceipt {status:'granted'|'duplicate'|'ignored'|'failed';reward:RewardResult|null;balance:number}
export function emptyProfile():PlayerProfileV1{return{version:1,coins:0,stats:{runsPlayed:0,classicClears:0,totalKills:0,bestTerritoryPercent:0,longestRunSeconds:0},processedRuns:[],worlds:[]};}
const safe=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const text=(v:unknown,max=128):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validProfile(value:unknown):value is PlayerProfileV1 {
 if(!object(value)||value.version!==1||!safe(value.coins)||!object(value.stats)||!['runsPlayed','classicClears','totalKills'].every(k=>safe((value.stats as Record<string,unknown>)[k]))||typeof value.stats.bestTerritoryPercent!=='number'||!Number.isFinite(value.stats.bestTerritoryPercent)||value.stats.bestTerritoryPercent<0||value.stats.bestTerritoryPercent>100||typeof value.stats.longestRunSeconds!=='number'||!Number.isFinite(value.stats.longestRunSeconds)||value.stats.longestRunSeconds<0||
 !Array.isArray(value.processedRuns)||value.processedRuns.length>PROFILE_HISTORY_LIMIT||!Array.isArray(value.worlds)||value.worlds.length>PROFILE_WORLD_LIMIT)return false;
 const runs=new Set<string>(),worlds=new Set<string>();
 for(const r of value.processedRuns){if(!object(r)||!text(r.runId,320)||runs.has(r.runId)||!['baseCoins','territoryCoins','killCoins','clearBonusCoins','totalCoins'].every(k=>safe(r[k]))||r.totalCoins!==Number(r.baseCoins)+Number(r.territoryCoins)+Number(r.killCoins)+Number(r.clearBonusCoins))return false;runs.add(r.runId);}
 for(const w of value.worlds){if(!object(w)||!text(w.matchId)||worlds.has(w.matchId)||!Array.isArray(w.participants)||!w.participants.length||w.participants.length>16)return false;worlds.add(w.matchId);const people=new Set<string>();
  for(const p of w.participants){if(!object(p)||!text(p.participantId)||people.has(p.participantId)||!safe(p.observedLifeId)||p.observedLifeId<1||!safe(p.paidLifeId)||p.paidLifeId>p.observedLifeId||!safe(p.initialTerritoryCells)||p.initialTerritoryCells<1||!text(p.ownerId)||typeof p.closed!=='boolean')return false;people.add(p.participantId);}
 }return true;
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
 profile.coins=coins;profile.stats={runsPlayed:runs,classicClears:clears,totalKills:kills,bestTerritoryPercent:Math.max(profile.stats.bestTerritoryPercent,result.bestTerritoryPercent),longestRunSeconds:Math.max(profile.stats.longestRunSeconds,result.durationTicks/result.simulationHz)};
 p.paidLifeId=result.lifeId;profile.processedRuns.push(reward);if(profile.processedRuns.length>PROFILE_HISTORY_LIMIT)profile.processedRuns.splice(0,profile.processedRuns.length-PROFILE_HISTORY_LIMIT);
 return{status:'granted',reward:{...reward},balance:profile.coins};
}

import {DEFAULT_MARKER_ID,DEFAULT_MARKER_COLOR_ID,markerDefinition,markerColorDefinition,productDefinition,type ProductKind} from './catalog.js';
import type {PlayerProfileV1} from './profile.js';
export interface PlayerInventory {
  version:1;ownedMarkerIds:string[];ownedMarkerColorIds:string[];
  equippedMarkerId:string;equippedMarkerColorId:string;
}
export interface ShopReceipt {status:'purchased'|'owned'|'insufficient'|'equipped'|'already-equipped'|'not-owned'|'unknown';kind:ProductKind;id:string;balance:number}
const identifier=(id:unknown):id is string=>typeof id==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function defaultInventory():PlayerInventory {
  return{version:1,ownedMarkerIds:[DEFAULT_MARKER_ID],ownedMarkerColorIds:[DEFAULT_MARKER_COLOR_ID],equippedMarkerId:DEFAULT_MARKER_ID,equippedMarkerColorId:DEFAULT_MARKER_COLOR_ID};
}
function restoreOwned(value:unknown,defaultId:string):string[] {
  // Keep stable unknown IDs for assets temporarily missing from a future catalog.
  const ids=Array.isArray(value)?[...new Set(value.filter(identifier))].slice(0,1024):[];
  if(!ids.includes(defaultId)){if(ids.length===1024)ids.pop();ids.unshift(defaultId);}return ids;
}
export function normalizeInventory(value:unknown):PlayerInventory {
  const saved=record(value)?value:{};
  const ownedMarkerIds=restoreOwned(saved.ownedMarkerIds,DEFAULT_MARKER_ID),ownedMarkerColorIds=restoreOwned(saved.ownedMarkerColorIds,DEFAULT_MARKER_COLOR_ID);
  const marker=saved.equippedMarkerId,color=saved.equippedMarkerColorId;
  return{version:1,ownedMarkerIds,ownedMarkerColorIds,
    equippedMarkerId:identifier(marker)&&ownedMarkerIds.includes(marker)&&markerDefinition(marker)?marker:DEFAULT_MARKER_ID,
    equippedMarkerColorId:identifier(color)&&ownedMarkerColorIds.includes(color)&&markerColorDefinition(color)?color:DEFAULT_MARKER_COLOR_ID};
}
export function validInventory(v:unknown):v is PlayerInventory {
  if(!record(v)||v.version!==1)return false;
  const owned=(a:unknown,base:string):a is string[]=>Array.isArray(a)&&a.length>0&&a.length<=1024&&a.every(identifier)&&new Set(a).size===a.length&&a.includes(base);
  return owned(v.ownedMarkerIds,DEFAULT_MARKER_ID)&&owned(v.ownedMarkerColorIds,DEFAULT_MARKER_COLOR_ID)&&
    identifier(v.equippedMarkerId)&&v.ownedMarkerIds.includes(v.equippedMarkerId)&&!!markerDefinition(v.equippedMarkerId)&&
    identifier(v.equippedMarkerColorId)&&v.ownedMarkerColorIds.includes(v.equippedMarkerColorId)&&!!markerColorDefinition(v.equippedMarkerColorId);
}
export function ownedItem(profile:PlayerProfileV1,kind:ProductKind,id:string):boolean {
  return(kind==='marker'?profile.inventory.ownedMarkerIds:profile.inventory.ownedMarkerColorIds).includes(id);
}
export function equippedItem(profile:PlayerProfileV1,kind:ProductKind):string {
  return kind==='marker'?profile.inventory.equippedMarkerId:profile.inventory.equippedMarkerColorId;
}
export function purchaseItem(profile:PlayerProfileV1,kind:ProductKind,id:string):ShopReceipt {
  const product=productDefinition(kind,id),receipt=(status:ShopReceipt['status']):ShopReceipt=>({status,kind,id,balance:profile.coins});
  if(!product)return receipt('unknown');
  if(ownedItem(profile,kind,id))return receipt('owned');
  if(!Number.isSafeInteger(product.price)||product.price<0)throw new Error('Invalid catalog price');
  if(profile.coins<product.price)return receipt('insufficient');
  const owned=kind==='marker'?profile.inventory.ownedMarkerIds:profile.inventory.ownedMarkerColorIds;
  if(owned.length>=1024)throw new Error('Inventory capacity reached');
  profile.coins-=product.price;owned.push(id);return receipt('purchased');
}
export function equipItem(profile:PlayerProfileV1,kind:ProductKind,id:string):ShopReceipt {
  const receipt=(status:ShopReceipt['status']):ShopReceipt=>({status,kind,id,balance:profile.coins});
  if(!productDefinition(kind,id))return receipt('unknown');
  if(!ownedItem(profile,kind,id))return receipt('not-owned');
  if(equippedItem(profile,kind)===id)return receipt('already-equipped');
  if(kind==='marker')profile.inventory.equippedMarkerId=id;else profile.inventory.equippedMarkerColorId=id;
  return receipt('equipped');
}

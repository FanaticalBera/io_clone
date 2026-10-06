import {MARKERS} from './catalog.js';
import type {PlayerProfileV1} from './profile.js';
export type TestMarkerGift='cat'|'all';
export function testMarkerGiftKind(search:string,development:boolean):TestMarkerGift|null{
 const gift=new URLSearchParams(search).get('testMarkerGift');
 return development&&(gift==='cat'||gift==='all')?gift:null;
}
export function testMarkerGift(search:string,development:boolean):boolean{return testMarkerGiftKind(search,development)!==null;}
export function hasTestMarkerGift(profile:PlayerProfileV1,gift:TestMarkerGift):boolean{
 return gift==='all'?MARKERS.every(m=>profile.inventory.ownedMarkerIds.includes(m.id)):profile.inventory.ownedMarkerIds.includes('cat')&&profile.inventory.equippedMarkerId==='cat';
}
export function claimTestMarker(profile:PlayerProfileV1,gift:TestMarkerGift='cat'):void{
 const owned=profile.inventory.ownedMarkerIds,ids=gift==='all'?MARKERS.map(m=>m.id):['cat'],missing=ids.filter(id=>!owned.includes(id));
 if(owned.length+missing.length>1024)throw new Error('Inventory capacity reached');
 owned.push(...missing);
 if(gift==='cat')profile.inventory.equippedMarkerId='cat';
}

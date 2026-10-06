import type {PlayerProfileV1} from './profile.js';
export function testMarkerGift(search:string,development:boolean):boolean{
  return development&&new URLSearchParams(search).get('testMarkerGift')==='cat';
}
export function claimTestMarker(profile:PlayerProfileV1):void{
  const owned=profile.inventory.ownedMarkerIds;
  if(!owned.includes('cat')){if(owned.length>=1024)throw new Error('Inventory capacity reached');owned.push('cat');}
  profile.inventory.equippedMarkerId='cat';
}

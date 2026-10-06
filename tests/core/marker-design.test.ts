import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {MARKERS,markerDefinition} from '../../src/client/catalog.js';
import {migrateProfile,emptyProfile} from '../../src/client/profile.js';
import {claimTestMarker,testMarkerGift} from '../../src/client/test-marker-gift.js';
import {markerArt} from '../../src/client/marker-art.js';
describe('approved marker catalog and local test gift',()=>{
 it('includes eleven approved designs, excludes moon, and preserves legacy product IDs',()=>{
  const designs=MARKERS.filter(m=>m.renderType==='IMAGE');
  expect(designs).toHaveLength(11);expect(markerDefinition('moon')).toBeUndefined();expect(markerDefinition('ghost')).toBeDefined();
  for(const id of ['cat','slime','crystal','core','orbit'])expect(markerDefinition(id)?.renderType).toBe('IMAGE');
  expect(designs.filter(m=>m.category==='FANTASY')).toHaveLength(2);
  for(const d of designs)for(const key of [d.assetKey!,d.detailAssetKey!]){
   const path='public/assets/markers/'+key.replace(/^marker-/,'')+'.png';expect(existsSync(path)).toBe(true);
   const png=readFileSync(path);expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(16)).toBe(256);expect(png.readUInt32BE(20)).toBe(256);
  }
 });
 it('restores existing paid placeholder ownership/equipment without another purchase',()=>{
  const old=emptyProfile();old.coins=321;old.inventory.ownedMarkerIds.push('cat');old.inventory.equippedMarkerId='cat';
  expect(migrateProfile(old)).toEqual(old);
 });
 it('grants and equips just cat, preserves wallet/ledgers/color, and is ownership-idempotent',()=>{
  const p=emptyProfile();p.coins=123;p.stats.totalKills=7;
  p.inventory.ownedMarkerColorIds.push('coral');p.inventory.equippedMarkerColorId='coral';
  p.worlds.push({matchId:'paid',participants:[{participantId:'h',ownerId:'saved',initialTerritoryCells:7,observedLifeId:2,paidLifeId:2,closed:true}]});
  const before=structuredClone(p);claimTestMarker(p);expect(p.inventory.ownedMarkerIds).toEqual(['default','cat']);expect(p.inventory.equippedMarkerId).toBe('cat');expect(p.inventory.equippedMarkerColorId).toBe('coral');
  const {inventory,...core}=p,{inventory:oldInventory,...oldCore}=before;expect(core).toEqual(oldCore);
  const granted=structuredClone(p);claimTestMarker(p);expect(p).toEqual(granted);
 });
 it('accepts only the explicit development claim link; production and arbitrary items cannot claim',()=>{
  expect(testMarkerGift('?testMarkerGift=cat',true)).toBe(true);
  for(const query of ['','?testMarkerGift=crown','?testMarkerGift=default','?testMarkerGift=CAT'])expect(testMarkerGift(query,true)).toBe(false);
  expect(testMarkerGift('?testMarkerGift=cat',false)).toBe(false);
 });
 it('keeps slot 15 identity separate from image body and ignores equipment for other players',()=>{
  const self=markerArt({markerId:'cat',markerColorId:'violet'},0x9b644d,true);
  expect(self.bodyColor).toBe(0xa180f4);expect(self.primitives.at(-1)).toMatchObject({stroke:0x9b644d,tag:'IDENTIFICATION'});
  expect(markerArt({markerId:'cat',markerColorId:'violet'},0x9b644d,false)).toMatchObject({markerId:'default',bodyColor:0x9b644d});
 });
});

import {describe,it,expect} from 'vitest';
import {MARKERS,markerDefinition} from '../../src/client/catalog.js';
import {migrateProfile,emptyProfile} from '../../src/client/profile.js';
import {claimTestMarker,testMarkerGift} from '../../src/client/test-marker-gift.js';
import {markerArt} from '../../src/client/marker-art.js';
import {MARKER_SHAPES} from '../../src/client/marker-shapes.js';
describe('approved marker catalog and local test gift',()=>{
 it('includes twenty vector designs, four per category, and preserves legacy product IDs',()=>{
  expect(MARKERS).toHaveLength(20);expect(markerDefinition('moon')).toBeUndefined();
  for(const id of ['default','ring','hex','target','cat','chick','slime','crystal','ghost','core','radar','drone','orbit','crown','ember'])expect(markerDefinition(id)).toBeDefined();
  for(const category of ['BASIC','CUTE','FANTASY','TECH','SPECIAL'])expect(MARKERS.filter(m=>m.category===category)).toHaveLength(4);
  for(const m of MARKERS)expect(MARKER_SHAPES[m.id]).toBeDefined();
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
  expect(testMarkerGift('?testMarkerGift=cat',false)).toBe(false);expect(testMarkerGift('?testMarkerGift=all',true)).toBe(true);expect(testMarkerGift('?testMarkerGift=all',false)).toBe(false);
 });
 it('grants every catalog marker once without changing Coins, ledgers, selected marker or color',()=>{
  const p=emptyProfile();claimTestMarker(p);p.coins=321;p.stats.totalKills=12;p.inventory.ownedMarkerIds.push('future-marker');
  p.worlds.push({matchId:'paid',participants:[{participantId:'h',ownerId:'saved',initialTerritoryCells:7,observedLifeId:2,paidLifeId:2,closed:true}]});
  const before=structuredClone(p);claimTestMarker(p,'all');const {inventory,...core}=p,{inventory:oldInventory,...oldCore}=before;expect(core).toEqual(oldCore);
  expect(inventory).toEqual({...oldInventory,ownedMarkerIds:[...oldInventory.ownedMarkerIds,...MARKERS.map(m=>m.id).filter(id=>!oldInventory.ownedMarkerIds.includes(id))]});
  const all=structuredClone(p);claimTestMarker(p,'all');expect(p).toEqual(all);
 });
 it('keeps slot identity separate from the body colour and ignores equipment for other players',()=>{
  const self=markerArt({markerId:'cat',markerColorId:'violet'},0x9b644d,true);
  expect(self).toMatchObject({bodyColor:0xa180f4,slotColor:0x9b644d,local:true});
  expect(markerArt({markerId:'cat',markerColorId:'violet'},0x9b644d,false)).toMatchObject({markerId:'default',bodyColor:0x9b644d});
 });
});

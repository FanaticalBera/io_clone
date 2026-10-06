import {it,expect} from 'vitest';
import {emptyProfile} from '../../src/client/profile.js';
import {MARKERS,MARKER_COLORS} from '../../src/client/catalog.js';
import {profileViewModel} from '../../src/client/profile-view-model.js';
it('maps all persisted stats and collection values without changing the profile',()=>{
 const p=emptyProfile();p.coins=321;p.stats={runsPlayed:12,totalKills:47,bestTerritoryPercent:32.4,classicClears:2,longestRunSeconds:193.5};p.inventory.ownedMarkerIds.push('cat');p.inventory.equippedMarkerId='cat';p.inventory.ownedMarkerColorIds.push('violet');p.inventory.equippedMarkerColorId='violet';const before=structuredClone(p),m=profileViewModel(p);
 expect(m.coins).toBe(321);expect(m.stats).toEqual(p.stats);expect(m.stats).not.toBe(p.stats);expect(m.collection).toEqual({markersOwned:2,markersTotal:MARKERS.length,colorsOwned:2,colorsTotal:MARKER_COLORS.length});expect(m.equipped).toEqual({markerId:'cat',markerName:'말랑냥',colorId:'violet',colorName:'Violet',colorValue:0xa180f4});expect(p).toEqual(before);
});
it('shows new user defaults and complete catalog ownership accurately',()=>{
 const p=emptyProfile();expect(profileViewModel(p)).toMatchObject({coins:0,stats:{runsPlayed:0,totalKills:0,classicClears:0,bestTerritoryPercent:0,longestRunSeconds:0},collection:{markersOwned:1,colorsOwned:1},equipped:{markerName:'Default',colorName:'슬롯 기본'}});
 p.inventory.ownedMarkerIds=MARKERS.map(m=>m.id);p.inventory.ownedMarkerColorIds=MARKER_COLORS.map(c=>c.id);const m=profileViewModel(p);expect(m.collection.markersOwned).toBe(m.collection.markersTotal);expect(m.collection.colorsOwned).toBe(m.collection.colorsTotal);
});
it('does not count missing or duplicate catalog IDs and safely falls back for removed equipment',()=>{
 const p=emptyProfile();p.inventory.ownedMarkerIds.push('cat','cat','missing');p.inventory.ownedMarkerColorIds.push('coral','coral','missing');p.inventory.equippedMarkerId='missing';p.inventory.equippedMarkerColorId='missing';const before=structuredClone(p),m=profileViewModel(p);expect(m.collection).toMatchObject({markersOwned:2,colorsOwned:2});expect(m.equipped).toMatchObject({markerId:'default',markerName:'Default',colorId:'slot',colorName:'슬롯 기본'});expect(p).toEqual(before);
});
it('does not invent run history or derive averages from reward receipts',()=>{
 const p=emptyProfile();p.processedRuns.push({runId:'m:h:life:1',baseCoins:5,territoryCoins:6,killCoins:60,clearBonusCoins:0,totalCoins:71});const m=profileViewModel(p);expect(m.stats.totalKills).toBe(0);expect(m.stats.bestTerritoryPercent).toBe(0);expect(m).not.toHaveProperty('recentRuns');expect(m).not.toHaveProperty('averageTerritoryPercent');
});

import {MARKER_SHAPES} from '../../src/client/marker-shapes.js';
import {describe,it,expect} from 'vitest';
import {emptyProfile,migrateProfile,validProfile,admitRun,grantProfileReward} from '../../src/client/profile.js';
import {defaultInventory,normalizeInventory,purchaseItem,equipItem,validInventory} from '../../src/client/inventory.js';
import {MARKERS,MARKER_COLORS,MARKER_CATEGORIES,SHOP_PRICES,MARKER_SETS,earnedTitles} from '../../src/client/catalog.js';
import {markerArt} from '../../src/client/marker-art.js';
function legacyWallet(){
  const p=emptyProfile();p.coins=500;
  p.stats={runsPlayed:2,classicClears:1,totalKills:12,bestTerritoryPercent:100,longestRunSeconds:95};
  p.processedRuns=[{runId:'legacy:h:life:1',baseCoins:5,territoryCoins:200,killCoins:36,clearBonusCoins:100,totalCoins:341}];
  p.worlds=[{matchId:'legacy',participants:[{participantId:'h',observedLifeId:1,paidLifeId:1,initialTerritoryCells:7,ownerId:'old',closed:true}]}];
  const {inventory,...legacy}=p;return legacy;
}
const withHexRecord=(w:ReturnType<typeof legacyWallet>)=>({...w,stats:{...w.stats,maps:{hex:{best:w.stats.bestTerritoryPercent,clears:w.stats.classicClears,runs:w.stats.runsPlayed}}}});
describe('additive Inventory migration',()=>{
  it('adds only defaults to a valid legacy profile without resetting any wallet data',()=>{
    const old=legacyWallet(),before=structuredClone(old),next=migrateProfile(old)!;const {inventory,...core}=next;
    // Legacy totals also become the hexagon's per-map record; nothing else changes.
    expect(core).toEqual(withHexRecord(before));expect(inventory).toEqual(defaultInventory());expect(old).toEqual(before);expect(validProfile(next)).toBe(true);
  });
  it('repairs only invalid equipped marker and keeps owned colors, wallet and paid ledgers',()=>{
    const old={...legacyWallet(),inventory:{...defaultInventory(),ownedMarkerIds:['default','ring'],ownedMarkerColorIds:['slot','coral'],equippedMarkerId:'gone',equippedMarkerColorId:'coral'}};
    const next=migrateProfile(old)!;expect(next.inventory).toEqual({...old.inventory,equippedMarkerId:'default'});const {inventory,...core}=next;expect(core).toEqual(withHexRecord(legacyWallet()));
  });
  it('repairs only invalid/unowned color and keeps the equipped marker',()=>{
    const old={...legacyWallet(),inventory:{...defaultInventory(),ownedMarkerIds:['default','hex'],equippedMarkerId:'hex',equippedMarkerColorId:'violet'}};
    const next=migrateProfile(old)!;expect(next.inventory.equippedMarkerId).toBe('hex');expect(next.inventory.equippedMarkerColorId).toBe('slot');expect(next.coins).toBe(500);expect(next.processedRuns).toEqual(old.processedRuns);
  });
  it('recovers malformed inventory fields independently and retains unknown owned IDs for future catalog changes',()=>{
    const inv=normalizeInventory({ownedMarkerIds:['ring','future-marker','ring',null],ownedMarkerColorIds:['slot','coral'],equippedMarkerId:'ring',equippedMarkerColorId:'coral'});
    expect(inv.ownedMarkerIds).toEqual(['default','ring','future-marker']);expect(inv.equippedMarkerColorId).toBe('coral');expect(validInventory(inv)).toBe(true);
    expect(normalizeInventory({...inv,ownedMarkerColorIds:-1}).ownedMarkerIds).toEqual(inv.ownedMarkerIds);
  });
  it('keeps existing dedup valid after migration and rejects corrupt base wallet separately',()=>{
    const p=migrateProfile(legacyWallet())!,before=structuredClone(p);const r={runId:'legacy:h:life:1',matchId:'legacy',participantId:'h',lifeId:1,endReason:'FULL_CAPTURE_WIN' as const,startedAtTick:0,endedAtTick:2850,durationTicks:2850,simulationHz:30,mapCellCount:1000,kills:12,bestTerritoryCells:1000,bestTerritoryPercent:100};
    expect(grantProfileReward(p,r).status).toBe('duplicate');expect(p).toEqual(before);expect(migrateProfile({...legacyWallet(),coins:-1})).toBeNull();
  });
});
describe('Catalog-based purchase and equip',()=>{
  it('starts with one default marker and one auto-slot Marker Color owned and equipped',()=>expect(emptyProfile().inventory).toEqual(defaultInventory()));
  it('keeps unique stable IDs, all categories, and safe prices',()=>{
    expect(new Set(MARKERS.map(d=>d.id)).size).toBe(MARKERS.length);expect(new Set(MARKER_COLORS.map(d=>d.id)).size).toBe(MARKER_COLORS.length);
    expect([...new Set(MARKERS.map(d=>d.category))].sort()).toEqual([...MARKER_CATEGORIES].sort());
    expect(MARKERS.every(d=>Number.isSafeInteger(d.price)&&d.price>=0)).toBe(true);expect(MARKERS.filter(d=>d.category==='BASIC'&&!d.reward)).toHaveLength(16);expect(MARKERS.every(d=>d.id in MARKER_SHAPES)).toBe(true);
  });
  it.each([['marker','ring',250],['marker','star',250],['marker','cat',600],['marker','orbit',1200],['marker','phoenix',2250],['marker-color','coral',100]] as const)('buys %s/%s once at its current price without auto-equip', (kind,id,price)=>{
    const p=migrateProfile(legacyWallet())!,stats=structuredClone(p.stats),worlds=structuredClone(p.worlds),paid=structuredClone(p.processedRuns);
    p.coins=price-1;const before=structuredClone(p);expect(purchaseItem(p,kind,id).status).toBe('insufficient');expect(p).toEqual(before);
    p.coins=price;expect(purchaseItem(p,kind,id).status).toBe('purchased');expect(p.coins).toBe(0);expect(purchaseItem(p,kind,id).status).toBe('owned');expect(p.coins).toBe(0);
    expect(p.inventory.equippedMarkerId).toBe('default');expect(p.inventory.equippedMarkerColorId).toBe('slot');
    expect(p.stats).toEqual(stats);expect(p.worlds).toEqual(worlds);expect(p.processedRuns).toEqual(paid);
  });
  it('rejects insufficient funds, unknown IDs and unowned equipment without mutation',()=>{
    const p=emptyProfile(),before=structuredClone(p);expect(purchaseItem(p,'marker','ring').status).toBe('insufficient');expect(purchaseItem(p,'marker','absent').status).toBe('unknown');expect(equipItem(p,'marker','ring').status).toBe('not-owned');expect(p).toEqual(before);
  });
  it('buys with exact funds and equips one item per kind without additional spending',()=>{
    const p=emptyProfile();p.coins=SHOP_PRICES.basicMarker+SHOP_PRICES.markerColor;purchaseItem(p,'marker','ring');purchaseItem(p,'marker-color','coral');expect(p.coins).toBe(0);
    expect(equipItem(p,'marker','ring').status).toBe('equipped');expect(equipItem(p,'marker-color','coral').status).toBe('equipped');
    expect(equipItem(p,'marker','default').status).toBe('equipped');expect(p.inventory.equippedMarkerColorId).toBe('coral');expect(equipItem(p,'marker','default').status).toBe('already-equipped');expect(p.coins).toBe(0);
  });
  it('records normal rewards without changing Inventory',()=>{
    const p=emptyProfile();p.coins=600;purchaseItem(p,'marker','ring');equipItem(p,'marker','ring');const before=structuredClone(p.inventory);
    const a={matchId:'m',participantId:'h',lifeId:1,initialTerritoryCells:7,ownerId:'tab'};admitRun(p,a);
    grantProfileReward(p,{runId:'m:h:life:1',matchId:'m',participantId:'h',lifeId:1,endReason:'DEATH',startedAtTick:0,endedAtTick:30,durationTicks:30,simulationHz:30,mapCellCount:1000,kills:0,bestTerritoryCells:30,bestTerritoryPercent:3});
    expect(p.inventory).toEqual(before);expect(p.coins).toBe(600-SHOP_PRICES.basicMarker+11);
  });
});
describe('Marker Color is a local presentation',()=>{
  it.each(['default','ring','hex','target'])('draws %s body with selected color and keeps the slot identity',id=>{
    const a=markerArt({markerId:id,markerColorId:'coral'},0x359aff,true);expect(a.bodyColor).toBe(0xff7084);expect(a.slotColor).toBe(0x359aff);expect(a.markerId).toBe(id);
  });
  it('uses the actual slot for the free default color',()=>expect(markerArt({markerId:'hex',markerColorId:'slot'},0x359aff,true).bodyColor).toBe(0x359aff));
  it('ignores local equipment entirely for other participants',()=>{
    const a=markerArt({markerId:'target',markerColorId:'coral'},0x359aff,false);expect(a.markerId).toBe('default');expect(a.markerColorId).toBe('slot');expect(a.bodyColor).toBe(0x359aff);expect(a.local).toBe(false);
  });
  it('falls back safely when a visual definition is missing',()=>expect(markerArt({markerId:'gone',markerColorId:'gone'},0x359aff,true)).toMatchObject({markerId:'default',markerColorId:'slot',bodyColor:0x359aff}));
});
describe('Reward markers',()=>{
  it('cannot be bought and are granted once the last sold marker of the category is bought',()=>{
    const p=emptyProfile();p.coins=200000;
    expect(purchaseItem(p,'marker','crowncat').status).toBe('locked');
    const cute=MARKERS.filter(m=>m.category==='CUTE'&&!m.reward).map(m=>m.id);
    for(const id of cute.slice(0,-1))expect(purchaseItem(p,'marker',id).unlocked).toBeUndefined();
    expect(purchaseItem(p,'marker',cute.at(-1)!)).toMatchObject({status:'purchased',unlocked:['crowncat']});
    expect(p.inventory.ownedMarkerIds.filter(id=>id==='crowncat')).toHaveLength(1);
    for(const m of MARKERS)if(!m.reward&&!p.inventory.ownedMarkerIds.includes(m.id))purchaseItem(p,'marker',m.id);
    expect(MARKERS.every(m=>p.inventory.ownedMarkerIds.includes(m.id))).toBe(true);
  });
});
describe('Marker sets',()=>{
  it('only use sold markers and award titles when complete',()=>{
    for(const s of MARKER_SETS)for(const id of s.ids)expect(MARKERS.find(m=>m.id===id&&!m.reward),id).toBeDefined();
    expect(earnedTitles(['pawn','rook'])).toEqual([]);expect(earnedTitles(['pawn','rook','king','cat'])).toEqual(['체스 마스터']);
  });
});
import {KNOWN_TITLES,normalizeTitle} from '../../src/shared/titles.js';
describe('Room titles',()=>{
  it('accept every set title and drop anything else',()=>{
    expect([...KNOWN_TITLES].sort()).toEqual(MARKER_SETS.map(s=>s.title).sort());
    expect(normalizeTitle('행운아')).toBe('행운아');expect(normalizeTitle('운영자')).toBeUndefined();expect(normalizeTitle(5)).toBeUndefined();
  });
});

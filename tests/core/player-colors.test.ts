import {describe,it,expect} from 'vitest';
import {SLOT_COLORS,participantRenderColors} from '../../src/client/player-colors.js';
import {shuffledBotMarkers} from '../../src/client/bot-cosmetics.js';
import {MARKERS,MARKER_COLORS} from '../../src/client/catalog.js';
import {emptyProfile,migrateProfile} from '../../src/client/profile.js';
import {purchaseItem,equipItem} from '../../src/client/inventory.js';
import {markerArt} from '../../src/client/marker-art.js';
import {createMatch,buildView,stepMatch} from '../../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../../src/shared/bot.js';
const specs=[{participantId:'h',slot:0,nickname:'Human',kind:'HUMAN' as const},...botSpecs(15,1)];
const colored=MARKER_COLORS.filter(c=>c.value!==null);
describe('Player Color V2 presentation',()=>{
 it('provides sixteen distinct purchasable values and preserves all legacy IDs/RGB/prices',()=>{
  expect(colored).toHaveLength(16);expect(new Set(colored.map(c=>c.value)).size).toBe(16);
  for(const [id,rgb] of [['coral',0xff7084],['violet',0xa180f4],['cyan',0x59bfd8],['gold',0xffb43b]] as const)expect(colored.find(c=>c.id===id)).toMatchObject({value:rgb,price:30});
  expect(MARKER_COLORS.find(c=>c.id==='slot')).toMatchObject({value:null,price:0});
 });
 it('keeps all legacy defaults, including slot 15, for free/default/unknown equipment and previews',()=>{
  const view=buildView(createMatch({maxSlots:16},4,specs));for(const id of ['slot','missing'])expect(participantRenderColors(view,'h',id)).toEqual(SLOT_COLORS);
  expect(participantRenderColors(view,null,'coral')).toEqual(SLOT_COLORS);
 });
 it.each(colored.map(c=>[c.id,c.value!] as const))('reserves %s for HUMAN and gives all fifteen BOT unique remaining colors', (id,rgb)=>{
  const view=buildView(createMatch({maxSlots:16},4,specs)),before=structuredClone(view),colors=participantRenderColors(view,'h',id);
  expect(colors[0]).toBe(rgb);expect(new Set(colors).size).toBe(16);expect(colors.slice(1)).not.toContain(rgb);expect(colors.every(c=>colored.some(d=>d.value===c))).toBe(true);expect(view).toEqual(before);
 });
 it('supports HUMAN in slot 15 and changing selection without touching IDs or owner/trail data',()=>{
  const swapped=specs.map(p=>({...p,slot:p.slot===0?15:p.slot===15?0:p.slot})),view=buildView(createMatch({maxSlots:16},7,swapped)),before=structuredClone(view);
  for(const c of colored){const colors=participantRenderColors(view,'h',c.id);expect(colors[15]).toBe(c.value);expect(new Set(colors).size).toBe(16);}expect(view).toEqual(before);
 });
 it('online keeps other HUMAN slot colors when free and resolves local collisions before BOT allocation',()=>{
  const onlineSpecs=specs.map(p=>p.slot<4?{...p,kind:'HUMAN' as const}:p),view=buildView(createMatch({maxSlots:16},5,onlineSpecs)),colors=participantRenderColors(view,'h','violet',true);
  expect(colors[0]).toBe(0xa180f4);expect(colors[1]).toBe(SLOT_COLORS[1]);expect(colors[3]).toBe(SLOT_COLORS[3]);expect(colors[2]).not.toBe(colors[0]);expect(new Set(colors).size).toBe(16);for(let slot=1;slot<16;slot++)if(slot!==2)expect(colors[slot]).toBe(SLOT_COLORS[slot]);
 });
 it('buys/equips every new color using existing schema and leaves wallet history and stats intact',()=>{
  const p=emptyProfile();p.coins=1000;p.stats.totalKills=12;p.inventory.ownedMarkerColorIds.push('coral','violet','cyan','gold');p.inventory.equippedMarkerColorId='violet';const before=structuredClone(p);
  expect(migrateProfile(p)).toEqual(before);
  for(const c of colored){expect(['purchased','owned']).toContain(purchaseItem(p,'marker-color',c.id).status);expect(equipItem(p,'marker-color',c.id).status).toBe('equipped');expect(purchaseItem(p,'marker-color',c.id).status).toBe('owned');}
  expect(p.coins).toBe(640);expect(p.inventory.ownedMarkerColorIds).toHaveLength(17);expect(p.stats).toEqual(before.stats);expect(p.processedRuns).toEqual(before.processedRuns);expect(p.worlds).toEqual(before.worlds);expect(p.version).toBe(1);
 });
 it('shuffles cosmetic appearances per match only, uses all fifteen designs and never consumes global RNG',()=>{
  const a=shuffledBotMarkers('first'),b=shuffledBotMarkers('second');expect(a).toHaveLength(15);expect(new Set(a).size).toBe(15);expect([...a].sort()).toEqual(MARKERS.map(m=>m.id).sort());expect(a).toEqual(shuffledBotMarkers('first'));expect(a).not.toEqual(b);
  const art=markerArt({markerId:'cat',markerColorId:'slot'},0x147f84,false,true);expect(art).toMatchObject({markerId:'cat',bodyColor:0x147f84,local:false});expect(art.primitives.at(-1)).toMatchObject({stroke:0x147f84,tag:'IDENTIFICATION'});
  expect(markerArt({markerId:'cat',markerColorId:'violet'},0x147f84,false)).toMatchObject({markerId:'default',bodyColor:0x147f84});
 });
 it('cosmetic color/marker changes leave a deterministic AI replay identical',()=>{
  const a=createMatch({mapRadius:12,maxSlots:16},42,specs,'replay'),b=createMatch({mapRadius:12,maxSlots:16},42,specs,'replay');
  const memories=[a,b].map(m=>new Map(m.participants.filter(p=>p.kind==='BOT').map(p=>[p.participantId,createBotMemory(m.seed^(p.slot*2654435761))])));
  for(let tick=0;tick<45;tick++){
   participantRenderColors(buildView(b),'h',colored[tick%colored.length].id);shuffledBotMarkers('cosmetic-'+tick);
   for(const [i,m] of [a,b].entries()){const inputs=new Map();for(const p of m.participants)if(p.kind==='BOT'){const input=getBotInput(observeBot(m,p.participantId),memories[i].get(p.participantId)!);if(input)inputs.set(p.participantId,input);}stepMatch(m,inputs);}
  }
  expect(buildView(b)).toEqual(buildView(a));for(const [id,first] of memories[0]){const second=memories[1].get(id)!;const {random:nextA,...dataA}=first,{random:nextB,...dataB}=second;expect(dataB).toEqual(dataA);expect(Array.from({length:5},()=>nextB())).toEqual(Array.from({length:5},()=>nextA()));}
 });
});

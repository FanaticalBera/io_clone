/// <reference types="vite/client" />
import {createRenderer,COLORS} from '../../src/client/game-scene.js';
import {createMatch,buildView} from '../../src/shared/game.js';
import {botSpecs} from '../../src/shared/bot.js';
import {hexDistance} from '../../src/shared/hex.js';
import {setOwner,neutralizeTerritory,clearTrail,addTrail} from '../../src/shared/territory.js';
import {markDead} from '../../src/shared/life.js';
import {packSnapshot,unpackSnapshot} from '../../src/shared/protocol.js';
import {EFFECT_DURATION,type TerritoryEffectStyle} from '../../src/client/territory-effect-model.js';
if(!import.meta.env.DEV&&import.meta.env.MODE!=='test')throw Error('Development fixture only');
const m=createMatch({mapRadius:56,maxSlots:16},4,botSpecs(16),'territory-effect-fixture'),scene=createRenderer('field');
let size=250,style:TerritoryEffectStyle='WAVE_COLLAPSE',seq=0,painted:number[]=[],freezeElapsed:number|undefined;
const id=(q:number,r:number)=>m.map.byKey.get(q+','+r)!;
scene.setTerritoryEffect(style);
const candidateIds=m.map.cells.filter(c=>hexDistance(c,{q:0,r:0})>1&&!(c.q>0&&c.q<3&&c.r<0&&c.r>-9))
 .sort((a,b)=>(hexDistance(a,{q:0,r:0})+.17*Math.abs(a.q)-.04*a.r)-(hexDistance(b,{q:0,r:0})+.17*Math.abs(b.q)-.04*b.r)||a.id-b.id).map(c=>c.id);
function camera():void {
 scene.testCamera(0,0);
 const extent=Math.max(3,...painted.map(cell=>Math.max(Math.abs(m.map.cells[cell].center.x)+32,Math.abs(m.map.cells[cell].center.y)+32)));
 // Use the same overview framing in all styles, adapting only to scene size.
 const render=scene.renderState();scene.cameras.main.setZoom(Math.min(render.backing.width,render.backing.height)/(extent*2+80));
}
function show(reset=false):void {
 const v=unpackSnapshot(packSnapshot(buildView(m),++seq,performance.now(),m.participants[0].participantId));
 scene.setView(v,m.participants[0].participantId,true,reset);scene.freezePresentation();camera();
}
function restore(simultaneous=false):void {
 freezeElapsed=undefined;m.events=[];m.tick++;
 for(const p of m.participants){clearTrail(m,p);neutralizeTerritory(m,p);p.lifeState='FINISHED';p.spawnCells.clear();p.protectedUntilTick=0;p.deathContext=undefined;}
 const observer=m.participants[0];observer.cellId=id(0,0);observer.position={...m.map.cells[observer.cellId].center};observer.lifeState='DEAD_WAIT';
 const victim=m.participants[15];victim.lifeState='ALIVE';victim.cellId=id(24,0);victim.position={...m.map.cells[victim.cellId].center};
 painted=candidateIds.slice(0,size);for(const cell of painted)setOwner(m,cell,16);
 if(simultaneous){const second=m.participants[3];second.lifeState='ALIVE';second.cellId=id(25,-12);second.position={...m.map.cells[second.cellId].center};
  const other=m.map.cells.filter(c=>hexDistance(c,{q:25,r:-12})<=4&&m.owners[c.id]===0).map(c=>c.id);
  for(const cell of other)setOwner(m,cell,4);painted.push(...other);
 }
 show(true);
}
function replay(simultaneous=false):void {
 restore(simultaneous);markDead(m,m.participants[15],'TRAIL_CUT',undefined,{cause:'EXISTING_TRAIL_CONTACT',cellId:id(0,0)});
 if(simultaneous)markDead(m,m.participants[3],'WALL_HIT',undefined,{cause:'WALL_HIT',cellId:id(25,-12)});
 m.tick++;show();document.querySelector('#status')!.textContent=style+' · '+size.toLocaleString()+'칸 · '+EFFECT_DURATION[style]+'ms · 실제 영토는 이미 중립';
}
function resources(){
 const objects=scene.children.list,clock=scene.time as any;
 return {objects:objects.length,graphics:objects.filter(o=>o.type==='Graphics').length,particles:objects.filter(o=>o.type==='ParticleEmitter').length,
  tweens:scene.tweens.getTweens().length,timers:(clock._active?.length??0)+(clock._pendingInsertion?.length??0),
  listeners:scene.events.eventNames().reduce((n,event)=>n+scene.events.listenerCount(event),0),
  heap:(performance as any).memory?.usedJSHeapSize??null,effect:scene.territoryEffectState(),render:scene.resourceState()};
}
function select(nextStyle:TerritoryEffectStyle,nextSize=size):void {
 style=nextStyle;size=nextSize;scene.setTerritoryEffect(style);
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-style]'))button.setAttribute('aria-pressed',String(button.dataset.style===style));
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-size]'))button.setAttribute('aria-pressed',String(Number(button.dataset.size)===size));
 replay();
}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-style]'))button.onclick=()=>select(button.dataset.style as TerritoryEffectStyle);
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-size]'))button.onclick=()=>select(style,Number(button.dataset.size));
document.querySelector<HTMLButtonElement>('#replay')!.onclick=()=>replay();
// Controlled screenshot time is a fixture-only wrapper, not a production clock.
const initialize=()=>{
 if(!scene.territoryEffectState()){requestAnimationFrame(initialize);return;}
 const effect=(scene as any).territoryEffects,combat=(scene as any).combat;
 const effectUpdate=effect.update.bind(effect),combatUpdate=combat.update.bind(combat);
 effect.update=(now:number,view:unknown,culling:boolean)=>effectUpdate(freezeElapsed===undefined?now:(effect.model.effects[0]?.startedAt??now)+freezeElapsed,view,culling);
 combat.update=(now:number)=>combatUpdate(freezeElapsed===undefined?now:(combat.bursts[0]?.born??now)+freezeElapsed);
 restore();document.querySelector('#status')!.textContent='같은 모양 · slot 15 · 영토 밖 절단 원점. 재생 버튼으로 비교하세요.';
 Object.assign(window,{fixture:{m,scene,COLORS,id,show,replay,select,resources,
  freezeAt(elapsed:number){freezeElapsed=elapsed;effect.dirty=true;},
  resume(){freezeElapsed=undefined;effect.dirty=true;},
  camera(q:number,r:number){const c=m.map.cells[id(q,r)];scene.testCamera(c.center.x,c.center.y);},
  occlude(){const cells=effect.model.effects.flatMap((e:any)=>[...e.chunks.values()].flatMap((list:any)=>list.map((c:any)=>c.id)));
   const [owner,trail]=cells;m.participants[1].lifeState='ALIVE';m.participants[8].lifeState='ALIVE';setOwner(m,owner,2);addTrail(m,m.participants[8],trail);m.tick++;show();return {owner,trail};},
  end(){freezeElapsed=1000;effect.dirty=true;effectUpdate((effect.model.effects[0]?.startedAt??performance.now())+1000,scene.view,true);combatUpdate((combat.bursts[0]?.born??performance.now())+1000);},
  disable(){scene.setTerritoryEffect('NONE');},
  destroy(){effect.destroy();return effect.state();}
 }});
};requestAnimationFrame(initialize);
import Phaser from 'phaser';
import type {MapDefinition,MatchView,Vec} from '../shared/model.js';
import type {RenderChunk} from './render-chunks.js';
import {TerritoryEffectModel,collapseAppearance,type TerritoryEffectStyle} from './territory-effect-model.js';
import {FIELD} from './theme.js';
/** Pooled chunk Graphics, below current territory/trails. No particles/tweens/timers. */
export class TerritoryEffects {
 readonly model=new TerritoryEffectModel();
 private map:MapDefinition|null=null;private chunks=new Map<string,RenderChunk>();
 private graphics=new Map<string,Phaser.GameObjects.Graphics>();private drawn=new Set<string>();
 private points:Vec[]=Array.from({length:6},()=>({x:0,y:0}));
 private lastDraw=-Infinity;private dirty=true;private destroyed=false;private redraws=0;
 private metrics={updateMs:0,redrawMs:0,drawnCells:0,visibleChunks:0};
 constructor(private scene:Phaser.Scene){
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.destroy());
  scene.events.once(Phaser.Scenes.Events.DESTROY,()=>this.destroy());
 }
 setStyle(style:TerritoryEffectStyle):void {
  this.model.setStyle(style);this.clear();
  if(style==='NONE'){for(const g of this.graphics.values())g.destroy();this.graphics.clear();}
  else this.allocate();
 }
 setMap(map:MapDefinition,chunks:Map<string,RenderChunk>):void {
  this.clear();for(const g of this.graphics.values())g.destroy();this.graphics.clear();
  this.map=map;this.chunks=chunks;this.allocate();
 }
 private allocate():void {
  if(this.model.style==='NONE'||!this.map)return;
  for(const key of this.chunks.keys())if(!this.graphics.has(key))this.graphics.set(key,this.scene.add.graphics().setDepth(.5).setVisible(false));
 }
 accept(view:MatchView,oldOwners:Uint8Array,keys:readonly string[],colors:readonly number[],now:number,reset=false,previous?:MatchView):void {
  if(!this.map||this.model.style==='NONE')return;
  this.model.accept(view,oldOwners,this.map,keys,slot=>colors[slot],now,reset,previous);
  this.dirty=true;
 }
 update(now:number,view:MatchView,culling=true):void {
  if(!this.map||this.model.style==='NONE')return;
  const at=performance.now();this.model.expire(now);
  if(!this.model.effects.length){if(this.drawn.size)this.clear();this.metrics.updateMs=performance.now()-at;return;}
  if(!this.dirty&&now-this.lastDraw<1000/30){this.metrics.updateMs=performance.now()-at;return;}
  this.lastDraw=now;this.dirty=false;this.redraws++;
  const redrawAt=performance.now(),rect=this.scene.cameras.main.worldView,margin=16*Math.sqrt(3)*this.map.side;
  for(const key of this.drawn){const g=this.graphics.get(key)!;g.clear();g.setVisible(false);}this.drawn.clear();
  let drawnCells=0;
  for(const effect of this.model.effects)for(const [key,cells]of effect.chunks){
   const chunk=this.chunks.get(key)!;
   if(culling&&(chunk.maxX<rect.x-margin||chunk.minX>rect.right+margin||chunk.maxY<rect.y-margin||chunk.minY>rect.bottom+margin))continue;
   const g=this.graphics.get(key)!,before=drawnCells;
   for(const cell of cells){
    if(cell.cancelled)continue;
    if(view.owners[cell.id]!==0||view.trailMasks[cell.id]!==0){cell.cancelled=true;this.model.cancelledCells++;continue;}
    const a=collapseAppearance(effect.style,now-effect.startedAt,cell.delay,effect.color);if(a.alpha<=0)continue;
    const c=this.map.cells[cell.id];
    for(let i=0;i<6;i++){this.points[i].x=c.center.x+(c.vertices[i].x-c.center.x)*a.scale;this.points[i].y=c.center.y+(c.vertices[i].y-c.center.y)*a.scale;}
    g.fillStyle(a.color,a.alpha).fillPoints(this.points,true);
    g.lineStyle(1,FIELD.ground,a.alpha*.8).strokePoints(this.points,true);drawnCells++;
   }
   if(drawnCells>before){g.setVisible(true);this.drawn.add(key);}
  }
  this.metrics={updateMs:performance.now()-at,redrawMs:performance.now()-redrawAt,drawnCells,visibleChunks:this.drawn.size};
 }
 state(){return {...this.model.state(),...this.metrics,redraws:this.redraws,graphics:this.graphics.size,visibleGraphics:this.drawn.size,depth:.5,particles:0,tweens:0,timers:0};}
 private clear():void {
  for(const g of this.graphics.values()){g.clear();g.setVisible(false);}this.drawn.clear();this.dirty=true;this.lastDraw=-Infinity;
  this.metrics={updateMs:0,redrawMs:0,drawnCells:0,visibleChunks:0};
 }
 destroy():void {
  if(this.destroyed)return;this.destroyed=true;this.clear();this.model.effects=[];
  for(const g of this.graphics.values())g.destroy();this.graphics.clear();this.map=null;this.chunks=new Map();
 }
}
import Phaser from 'phaser';
import type {MapDefinition,MatchView,Cell} from '../shared/model.js';
import type {RenderChunk} from './render-chunks.js';
import {TerritoryCaptureModel,captureAppearance} from './territory-capture-model.js';
/** Small dedicated bloom layer; existing death renderer remains unchanged. */
export class TerritoryCaptureEffects {
 readonly model=new TerritoryCaptureModel();
 private map:MapDefinition|null=null;private chunks=new Map<string,RenderChunk>();
 private graphics=new Map<string,Phaser.GameObjects.Graphics>();private drawn=new Set<string>();
 private drawnEdges=0;
 private dirty=true;private lastDraw=-Infinity;private destroyed=false;private drawnCells=0;
 constructor(private scene:Phaser.Scene){
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.destroy());
  scene.events.once(Phaser.Scenes.Events.DESTROY,()=>this.destroy());
 }
 setEnabled(enabled:boolean):void{
  this.model.setEnabled(enabled);this.clear();
  if(!enabled){for(const g of this.graphics.values())g.destroy();this.graphics.clear();}else this.allocate();
 }
 setMap(map:MapDefinition,chunks:Map<string,RenderChunk>):void{
  this.clear();for(const g of this.graphics.values())g.destroy();this.graphics.clear();
  this.map=map;this.chunks=chunks;this.allocate();
 }
 private allocate():void{
  if(!this.model.enabled||!this.map)return;
  for(const key of this.chunks.keys())if(!this.graphics.has(key))this.graphics.set(key,this.scene.add.graphics().setDepth(2).setVisible(false));
 }
 accept(view:MatchView,oldOwners:Uint8Array,keys:readonly string[],colors:readonly number[],now:number,reset=false,previous?:MatchView):void{
  if(!this.map||!this.model.enabled)return;
  this.model.accept(view,oldOwners,this.map,keys,slot=>colors[slot],now,reset,previous);for(const effect of this.model.effects)effect.color=colors[effect.slot];this.dirty=true;
 }
 update(now:number,view:MatchView,culling=true):void{
  if(!this.map||!this.model.enabled)return;
  this.model.expire(now);
  if(!this.model.effects.length){if(this.drawn.size)this.clear();return;}
  if(!this.dirty&&now-this.lastDraw<1000/30)return;this.dirty=false;this.lastDraw=now;
  for(const key of this.drawn){const g=this.graphics.get(key)!;g.clear();g.setVisible(false);}this.drawn.clear();this.drawnCells=0;this.drawnEdges=0;
  const rect=this.scene.cameras.main.worldView,margin=16*Math.sqrt(3)*this.map.side;
  for(const effect of this.model.effects)for(const [key,cells]of effect.chunks){
   const chunk=this.chunks.get(key)!;
   if(culling&&(chunk.maxX<rect.x-margin||chunk.minX>rect.right+margin||chunk.maxY<rect.y-margin||chunk.minY>rect.bottom+margin))continue;
   const g=this.graphics.get(key)!,before=this.drawnCells,a=captureAppearance(now-effect.startedAt,effect.color);
   for(const cell of cells){
    if(cell.cancelled)continue;
    if(view.owners[cell.id]!==effect.slot+1||view.trailMasks[cell.id]!==0){cell.cancelled=true;this.model.cancelledCells++;continue;}
    if(a.lineAlpha<=0||(a.fillAlpha<=0&&cell.edges===0))continue;
    const c:Cell=this.map.cells[cell.id];
    if(a.fillAlpha>0)g.fillStyle(a.fillColor,a.fillAlpha).fillPoints(c.vertices,true);
    for(let k=0;k<6;k++)if(cell.edges&(1<<k)){
     const neighbor=c.neighbors[k];if(neighbor>=0&&view.trailMasks[neighbor]!==0)continue;
     const v=c.vertices[(6-k)%6],w=c.vertices[(7-k)%6];
     g.lineStyle(a.lineWidth,a.lineColor,a.lineAlpha).lineBetween(v.x,v.y,w.x,w.y);
     g.lineStyle(2,a.coreColor,a.lineAlpha).lineBetween(v.x,v.y,w.x,w.y);this.drawnEdges++;
    }
    this.drawnCells++;
   }
   if(this.drawnCells>before){g.setVisible(true);this.drawn.add(key);}
  }
 }
 private clear():void{for(const g of this.graphics.values()){g.clear();g.setVisible(false);}this.drawn.clear();this.drawnCells=0;this.drawnEdges=0;this.dirty=true;this.lastDraw=-Infinity;}
 state(){return {...this.model.state(),graphics:this.graphics.size,visibleGraphics:this.drawn.size,drawnCells:this.drawnCells,drawnEdges:this.drawnEdges,depth:2,particles:0,tweens:0,timers:0};}
 destroy():void{if(this.destroyed)return;this.destroyed=true;this.clear();this.model.effects=[];for(const g of this.graphics.values())g.destroy();this.graphics.clear();this.map=null;this.chunks=new Map();}
}

import Phaser from 'phaser';
import type {MapDefinition,MatchView,Cell,Vec} from '../shared/model.js';
import type {RenderChunk} from './render-chunks.js';
import {TerritoryCaptureModel,captureAppearance,CAPTURE_WAVE,type CaptureBloom} from './territory-capture-model.js';
const INK=0x1f1b2d,LOSS=0xffa24d,CONFETTI_MS=420;
/** Capture flip wave above territory, plus local-only ripple, confetti and loss cues. */
export class TerritoryCaptureEffects {
 readonly model=new TerritoryCaptureModel();
 private map:MapDefinition|null=null;private chunks=new Map<string,RenderChunk>();
 private graphics=new Map<string,Phaser.GameObjects.Graphics>();private drawn=new Set<string>();private overlay?:Phaser.GameObjects.Graphics;
 private points:Vec[]=Array.from({length:6},()=>({x:0,y:0}));
 private drawnEdges=0;private selfSlot=-1;private confetti=0;private lossArrows=0;
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
  this.overlay??=this.scene.add.graphics().setDepth(6);
 }
 accept(view:MatchView,oldOwners:Uint8Array,keys:readonly string[],colors:readonly number[],now:number,reset=false,previous?:MatchView,selfSlot=-1):void{
  if(!this.map||!this.model.enabled)return;this.selfSlot=selfSlot;
  this.model.accept(view,oldOwners,this.map,keys,slot=>colors[slot],now,reset,previous);for(const effect of this.model.effects)effect.color=colors[effect.slot];this.dirty=true;
 }
 private shape(c:Cell,scale:number,lift:number):Vec[]{
  for(let i=0;i<6;i++){this.points[i].x=c.center.x+(c.vertices[i].x-c.center.x)*scale;this.points[i].y=c.center.y+(c.vertices[i].y-c.center.y)*scale+lift;}
  return this.points;
 }
 update(now:number,view:MatchView,culling=true):void{
  if(!this.map||!this.model.enabled)return;
  this.model.expire(now);this.overlay?.clear();this.confetti=0;this.lossArrows=0;
  if(!this.model.effects.length){if(this.drawn.size)this.clear();return;}
  for(const effect of this.model.effects)this.drawOverlay(effect,now);
  if(!this.dirty&&now-this.lastDraw<1000/30)return;this.dirty=false;this.lastDraw=now;
  for(const key of this.drawn){const g=this.graphics.get(key)!;g.clear();g.setVisible(false);}this.drawn.clear();this.drawnCells=0;this.drawnEdges=0;
  const rect=this.scene.cameras.main.worldView,margin=16*Math.sqrt(3)*this.map.side;
  for(const effect of this.model.effects)for(const [key,cells]of effect.chunks){
   const chunk=this.chunks.get(key)!;
   if(culling&&(chunk.maxX<rect.x-margin||chunk.minX>rect.right+margin||chunk.maxY<rect.y-margin||chunk.minY>rect.bottom+margin))continue;
   const g=this.graphics.get(key)!,before=this.drawnCells,elapsed=now-effect.startedAt,localLoss=this.selfSlot>=0;
   for(const cell of cells){
    if(cell.cancelled)continue;
    if(view.owners[cell.id]!==effect.slot+1||view.trailMasks[cell.id]!==0){cell.cancelled=true;this.model.cancelledCells++;continue;}
    const a=captureAppearance(elapsed,cell.delay,effect.color),c:Cell=this.map.cells[cell.id];
    if(a.alpha>0){
     if(a.pending&&cell.prior){
      // A stolen tile cracks in its old colour until the wave flips it.
      const p=this.shape(c,1,3);g.fillStyle(cell.priorColor,1).fillPoints(p,true).fillStyle(INK,.25).fillPoints(p,true);
      const v=c.vertices;g.lineStyle(3,INK,.9).beginPath().moveTo(v[0].x,v[0].y+3).lineTo(c.center.x+4,c.center.y+1).lineTo(c.center.x-3,c.center.y+6).lineTo(v[3].x,v[3].y+3).strokePath();
     }else{
      const p=this.shape(c,a.scale,a.lift);g.fillStyle(a.fillColor,a.alpha).fillPoints(p,true);
      if(!a.pending)g.lineStyle(2,INK,.55).strokePoints(p,true);
     }
    }
    for(let k=0;k<6;k++){
     const v=c.vertices[(6-k)%6],w=c.vertices[(7-k)%6];
     if(a.lineAlpha>0&&cell.edges&(1<<k)){
      const neighbor=c.neighbors[k];if(neighbor>=0&&view.trailMasks[neighbor]!==0)continue;
      g.lineStyle(a.lineWidth,a.lineColor,a.lineAlpha).lineBetween(v.x,v.y,w.x,w.y);
      g.lineStyle(2,a.coreColor,a.lineAlpha).lineBetween(v.x,v.y,w.x,w.y);this.drawnEdges++;
     }
     // The local victim's freshly cut border flashes orange twice.
     if(localLoss&&a.lossAlpha>0&&cell.prior===this.selfSlot+1&&cell.victimEdges&(1<<k)){g.lineStyle(9,LOSS,a.lossAlpha).lineBetween(v.x,v.y,w.x,w.y);this.drawnEdges++;}
    }
    this.drawnCells++;
   }
   if(this.drawnCells>before){g.setVisible(true);this.drawn.add(key);}
  }
 }
 private drawOverlay(effect:CaptureBloom,now:number):void{
  const g=this.overlay;if(!g)return;const elapsed=now-effect.startedAt;
  if(effect.slot===this.selfSlot){
   const {x,y}=effect.origin;
   if(elapsed<300){const t=elapsed/300;g.lineStyle(3,INK,.5*(1-t)).strokeCircle(x,y,24+70*t+2).lineStyle(5,0xffffff,.95*(1-t)).strokeCircle(x,y,24+70*t);}
   const t=(elapsed-CAPTURE_WAVE)/CONFETTI_MS;
   if(t>=0&&t<1&&this.map){
    // Bigger captures (1% of the board or more) throw twice the pieces.
    const count=effect.cellCount>=this.map.cells.length/100?12:6,light=(effect.color&0xfefefe)/2+0x7f7f7f|0,r=7*(1-.4*t);
    for(let i=0;i<count;i++){
     const angle=-Math.PI/2+(i/count-.5)*Math.PI*1.6,speed=(i%3+2)*34,px=x+Math.cos(angle)*speed*t*1.6,py=y+Math.sin(angle)*speed*t*1.6+160*t*t-20;
     const spin=i+t*6;for(let k=0;k<6;k++){const a=spin+k*Math.PI/3;this.points[k].x=px+Math.cos(a)*r;this.points[k].y=py+Math.sin(a)*r;}
     g.fillStyle(light,1-t*t).fillPoints(this.points,true).lineStyle(2,INK,1-t*t).strokePoints(this.points,true);this.confetti++;
    }
   }
  }
  const loss=effect.losses.get(this.selfSlot+1);
  if(loss&&elapsed<1000)this.drawLossArrow(g,loss,elapsed);
 }
 /** Off-screen losses point from the screen edge toward the stolen land. */
 private drawLossArrow(g:Phaser.GameObjects.Graphics,target:Vec,elapsed:number):void{
  const view=this.scene.cameras.main.worldView;
  if(target.x>=view.x&&target.x<=view.right&&target.y>=view.y&&target.y<=view.bottom)return;
  const inset=Math.min(view.width,view.height)*.09,cx=view.centerX,cy=view.centerY,dx=target.x-cx,dy=target.y-cy;
  const sx=(view.width/2-inset)/Math.max(1e-6,Math.abs(dx)),sy=(view.height/2-inset)/Math.max(1e-6,Math.abs(dy)),s=Math.min(sx,sy),x=cx+dx*s,y=cy+dy*s,angle=Math.atan2(dy,dx);
  const size=inset*.55,alpha=elapsed<800?1:1-(elapsed-800)/200,pts=[[1,0],[-.7,-.75],[-.7,.75]].map(([a,b])=>({x:x+(a*Math.cos(angle)-b*Math.sin(angle))*size,y:y+(a*Math.sin(angle)+b*Math.cos(angle))*size}));
  g.fillStyle(LOSS,alpha).fillPoints(pts,true).lineStyle(size*.18,INK,alpha).strokePoints(pts,true);this.lossArrows++;
 }
 private clear():void{for(const g of this.graphics.values()){g.clear();g.setVisible(false);}this.overlay?.clear();this.drawn.clear();this.drawnCells=0;this.drawnEdges=0;this.dirty=true;this.lastDraw=-Infinity;}
 state(){return {...this.model.state(),graphics:this.graphics.size,visibleGraphics:this.drawn.size,drawnCells:this.drawnCells,drawnEdges:this.drawnEdges,depth:2,particles:this.confetti,lossArrows:this.lossArrows,tweens:0,timers:0};}
 destroy():void{if(this.destroyed)return;this.destroyed=true;this.clear();this.model.effects=[];for(const g of this.graphics.values())g.destroy();this.graphics.clear();this.overlay?.destroy();this.map=null;this.chunks=new Map();}
}

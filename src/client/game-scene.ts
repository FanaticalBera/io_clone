import Phaser from 'phaser';
import {Presentation} from './presentation.js';
import {CombatEffects} from './combat-effects.js';
import {worldCell} from '../shared/hex.js';
import {createMap} from '../shared/hex.js';
import type {MatchView,MapDefinition,Vec} from '../shared/model.js';
import {GAME_MODES} from '../shared/modes.js';
import {gameplayZoom,MOUSE_DEAD_ZONE} from './controls.js';
export const COLORS=[0x16cdb1,0xffb43b,0xa180f4,0x359aff,0xff7084,0xb5ce50,0xf3945c,0x59bfd8];
const cssColor=(color:number)=>'#'+color.toString(16).padStart(6,'0');
export class GameScene extends Phaser.Scene {
 view:MatchView|null=null;selfId:string|null=null;map:MapDefinition|null=null;
 private presentation=new Presentation();private online=false;private predictedLine?:Phaser.GameObjects.Graphics;
 private ground?:Phaser.GameObjects.Graphics;private groundImage?:Phaser.GameObjects.Image;private groundKey='';
 private chunks=new Map<string,Phaser.GameObjects.Graphics>();
 private lastOwners=new Uint8Array();private lastTrails=new Uint8Array();
 private avatars=new Map<string,{container:Phaser.GameObjects.Container;body:Phaser.GameObjects.Arc;shield:Phaser.GameObjects.Arc;label:Phaser.GameObjects.Text}>();
 private followTarget:Phaser.GameObjects.Container|null=null;
 private renderedAt=0;
 private combat?:CombatEffects;
 private killFeedback:()=>void=()=>{};
 setKillFeedback(callback:()=>void):void{this.killFeedback=callback;}
 private points:Phaser.GameObjects.Text[]=[];private lastMini=0;private created=false;
 constructor(){super('game');}
 create():void {this.created=true;this.cameras.main.setBackgroundColor('#e6e3d9');this.trackViewport();this.combat=new CombatEffects(this,COLORS,()=>this.killFeedback());if(this.view){this.drawView(this.view);this.combat.accept(this.view,this.selfId,true);}}
 private trackViewport():void {
  const parent=this.game.canvas.parentElement!;let frame=0;const abort=new AbortController();
  const fit=()=>{frame=0;const rect=parent.getBoundingClientRect(),width=Math.round(rect.width),height=Math.round(rect.height);if(width<1||height<1)return;
   if(this.scale.width!==width||this.scale.height!==height)this.scale.resize(width,height);
   Object.assign(this.game.canvas.style,{width:width+'px',height:height+'px',marginLeft:'0px',marginTop:'0px'});
   this.cameras.main.setZoom(this.selfId?gameplayZoom(width):Math.min(width/2200,height/2200));if(!this.selfId)this.cameras.main.centerOn(0,0);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(fit);};const observer=new ResizeObserver(schedule);observer.observe(parent);
  window.addEventListener('resize',schedule,{signal:abort.signal});window.addEventListener('orientationchange',schedule,{signal:abort.signal});window.visualViewport?.addEventListener('resize',schedule,{signal:abort.signal});
  const cleanup=()=>{observer.disconnect();abort.abort();cancelAnimationFrame(frame);};this.events.once(Phaser.Scenes.Events.SHUTDOWN,cleanup);this.events.once(Phaser.Scenes.Events.DESTROY,cleanup);fit();
 }
 setView(view:MatchView,selfId:string|null,online=false,reset=false):void {this.online=online;this.presentation.accept(view,selfId,performance.now(),reset,!online);this.view=view;this.selfId=selfId;if(this.created){this.drawView(view);this.combat?.accept(view,selfId,reset);}}
 setLocalInput(direction:Vec,seq:number):void{this.presentation.input(direction,seq,performance.now());}
 freezePresentation():void{this.presentation.freeze();}
 private hex(g:Phaser.GameObjects.Graphics,id:number,fill:number,alpha:number,outline?:number):void {
  const origin=g.getData('origin') as Vec|undefined;const vertices=origin?this.map!.cells[id].vertices.map(v=>({x:v.x-origin.x,y:v.y-origin.y})):this.map!.cells[id].vertices;
  if(alpha){g.fillStyle(fill,alpha);g.fillPoints(vertices,true);}
  if(outline!==undefined){g.lineStyle(1,outline,0.8);g.strokePoints(vertices,true);}
 }
 private chunkKey(id:number):string {const c=this.map!.cells[id];return Math.floor((c.q+this.map!.radius)/16)+':'+Math.floor((c.r+this.map!.radius)/16);}
 private drawView(view:MatchView):void {
  if(!this.map||this.map.mapId!==view.mapId){
   this.map=createMap(view.config.mapRadius,view.config.hexSideWorldUnits);
   this.ground?.destroy();this.groundImage?.destroy();if(this.groundKey)this.textures.remove(this.groundKey);
   const all=this.map.cells.flatMap(c=>c.vertices),minX=Math.floor(Math.min(...all.map(v=>v.x)))-3,minY=Math.floor(Math.min(...all.map(v=>v.y)))-3;
   const width=Math.ceil(Math.max(...all.map(v=>v.x)))-minX+3,height=Math.ceil(Math.max(...all.map(v=>v.y)))-minY+3;
   this.ground=this.add.graphics().setVisible(false).setData('origin',{x:minX,y:minY});
   for(const g of this.chunks.values())g.destroy();this.chunks.clear();
   for(const text of this.points)text.destroy();this.points=[];
   for(const c of this.map.cells){this.hex(this.ground,c.id,0xf5f2e9,1,0xd3d2c8);const key=this.chunkKey(c.id);if(!this.chunks.has(key))this.chunks.set(key,this.add.graphics().setDepth(1));}
   this.ground.lineStyle(3,0x9ba5a0,1);for(const e of this.map.boundaryEdges)this.ground.lineBetween(e.a.x-minX,e.a.y-minY,e.b.x-minX,e.b.y-minY);
   this.groundKey='ground-'+this.map.mapId;this.ground.generateTexture(this.groundKey,width,height);
   this.groundImage=this.add.image(minX,minY,this.groundKey).setOrigin(0).setDepth(0);
   for(const cp of this.map.controlPoints){const c=this.map.cells[cp.cellId];this.points.push(this.add.text(c.center.x,c.center.y,'◆ '+(cp.pointId+1),{fontFamily:'sans-serif',fontSize:'19px',fontStyle:'bold',color:'#142330',backgroundColor:'#ffce70',padding:{x:9,y:8}}).setOrigin(0.5).setDepth(4));}
   this.lastOwners=new Uint8Array(this.map.cells.length).fill(255);this.lastTrails=new Uint8Array(this.map.cells.length).fill(255);
  }
  const dirty=new Set<string>();
  for(let id=0;id<view.owners.length;id++)if(this.lastOwners[id]!==view.owners[id]||this.lastTrails[id]!==view.trailMasks[id])dirty.add(this.chunkKey(id));
  for(const key of dirty){
   const g=this.chunks.get(key)!;g.clear();
   for(const c of this.map.cells)if(this.chunkKey(c.id)===key){
    const owner=view.owners[c.id],mask=view.trailMasks[c.id];
    if(owner)this.hex(g,c.id,COLORS[owner-1],0.92,0xf5f2e9);
    for(let slot=0;slot<8;slot++)if(mask&(1<<slot)){
     // The entire traversed hex is vulnerable; keep it visibly lighter than captured land.
     this.hex(g,c.id,COLORS[slot],0.28,COLORS[slot]);
    }
   }
  }
  this.lastOwners.set(view.owners);this.lastTrails.set(view.trailMasks);
  const present=new Set(view.participants.map(p=>p.participantId));
  for(const [id,avatar]of this.avatars)if(!present.has(id)){avatar.container.destroy();this.avatars.delete(id);}
  for(const p of view.participants){
   let avatar=this.avatars.get(p.participantId);
   if(!avatar){
    const shield=this.add.circle(0,0,28,0x101b29,0).setStrokeStyle(3,COLORS[p.slot],0.9);
    const body=this.add.circle(0,0,21,COLORS[p.slot]).setStrokeStyle(5,0xffffff,1);
    const label=this.add.text(0,-43,(p.kind==='BOT'?'BOT · ':'')+p.nickname,{fontFamily:'Malgun Gothic, sans-serif',fontSize:'13px',fontStyle:'bold',color:'#ffffff',backgroundColor:'#142330',padding:{x:9,y:5}}).setOrigin(0.5);
    const container=this.add.container(p.position.x,p.position.y,[shield,body,label]).setDepth(5);
    avatar={container,body,shield,label};this.avatars.set(p.participantId,avatar);
   }
   avatar.container.setVisible(p.lifeState==='ALIVE');
   avatar.label.setScale(Math.max(1,.7/gameplayZoom(this.scale.width)));
   // Positions are applied only in the render update, keeping camera and avatar on one frame.
   avatar.shield.setVisible(p.protected);
   if(p.participantId===this.selfId){
    avatar.label.setText('YOU · '+p.nickname);
    // startFollow recenters immediately; restarting it for every snapshot causes camera shake.
    if(this.followTarget!==avatar.container){this.followTarget=avatar.container;this.cameras.main.startFollow(avatar.container,false,1,1);}
   }
  }
  for(const [i,cp]of this.map.controlPoints.entries()){const owner=view.owners[cp.cellId];this.points[i].setVisible(GAME_MODES[view.gameMode.id].usesControlPoints).setBackgroundColor(owner?cssColor(COLORS[owner-1]):'#ffce70');}
  if(!this.selfId){this.followTarget=null;this.cameras.main.stopFollow();this.cameras.main.centerOn(0,0);}
  this.cameras.main.setZoom(this.selfId?gameplayZoom(this.scale.width):Math.min(this.scale.width/2200,this.scale.height/2200));
  document.querySelector('#field')?.setAttribute('data-chunks',String(this.chunks.size));
  document.querySelector('#field')?.setAttribute('data-avatars',String(this.avatars.size));
 }
 update(time:number):void {
  if(!this.map||!this.view)return;
  const now=performance.now();this.renderedAt=now;
  this.combat?.update(now);
  for(const [id,avatar]of this.avatars){const position=this.presentation.position(id,now);if(position)avatar.container.setPosition(position.x,position.y);}
  if(this.online){
   this.predictedLine??=this.add.graphics().setDepth(3);this.predictedLine.clear();
   const self=this.view.participants.find(p=>p.participantId===this.selfId),position=self&&this.presentation.position(self.participantId,now);
   if(self?.lifeState==='ALIVE'&&position&&this.view.phase==='RUNNING'){
    const cell=worldCell(this.map,position);if(cell>=0&&this.view.owners[cell]!==self.slot+1){
     // The unconfirmed head cell is a quieter preview, replaced by the next snapshot.
     if(!(this.view.trailMasks[cell]&(1<<self.slot)))this.hex(this.predictedLine,cell,COLORS[self.slot],0.13);
    }
   }
  }else this.predictedLine?.clear();
  if(time-this.lastMini<250)return;this.lastMini=time;
  const canvas=document.querySelector<HTMLCanvasElement>('#minimap');if(!canvas)return;
  const context=canvas.getContext('2d');if(!context)return;
  const scale=Math.min((canvas.width-20)/(Math.sqrt(3)*this.map.side*(this.map.radius*2+1)),(canvas.height-20)/(this.map.side*(this.map.radius*3+2)));
  context.clearRect(0,0,canvas.width,canvas.height);context.fillStyle='#f5f2e9';context.fillRect(0,0,canvas.width,canvas.height);
  for(const c of this.map.cells){const owner=this.view.owners[c.id];context.fillStyle=owner?cssColor(COLORS[owner-1]):'#eeebe2';context.strokeStyle='#d8d7cc';context.lineWidth=.35;context.beginPath();c.vertices.forEach((v,i)=>{const x=canvas.width/2+v.x*scale,y=canvas.height/2+v.y*scale;if(i===0)context.moveTo(x,y);else context.lineTo(x,y);});context.closePath();context.fill();context.stroke();}
  if(GAME_MODES[this.view!.gameMode.id].usesControlPoints)for(const cp of this.map.controlPoints){const c=this.map.cells[cp.cellId],x=canvas.width/2+c.center.x*scale,y=canvas.height/2+c.center.y*scale;context.fillStyle='#ffb43b';context.beginPath();context.moveTo(x,y-3);context.lineTo(x+3,y);context.lineTo(x,y+3);context.lineTo(x-3,y);context.closePath();context.fill();}
  const self=this.view.participants.find(p=>p.participantId===this.selfId);if(self?.lifeState==='ALIVE'){const position=this.presentation.position(self.participantId,now)??self.position,x=canvas.width/2+position.x*scale,y=canvas.height/2+position.y*scale;context.fillStyle=cssColor(COLORS[self.slot]);context.strokeStyle='#ffffff';context.lineWidth=2;context.beginPath();context.arc(x,y,5,0,Math.PI*2);context.fill();context.stroke();context.strokeStyle=cssColor(COLORS[self.slot]);context.lineWidth=1.5;context.beginPath();context.arc(x,y,7,0,Math.PI*2);context.stroke();}
 }
 pointerDirection(x:number,y:number):Vec|null {
  const p=this.view?.participants.find(p=>p.participantId===this.selfId);if(!p)return null;
  // The camera maps the last rendered frame. Use the avatar from that same
  // frame; a newer predicted position would shift the control centre between
  // frames, especially when rendering is slow.
  const target=this.cameras.main.getWorldPoint(x,y),position=this.avatars.get(p.participantId)?.container??p.position;
  const vector={x:target.x-position.x,y:target.y-position.y};return Math.hypot(vector.x,vector.y)*this.cameras.main.zoom<MOUSE_DEAD_ZONE?null:vector;
 }
 combatState():ReturnType<CombatEffects['state']>|null{return this.combat?.state()??null;}
 renderState():{renderedAt:number;camera:{x:number;y:number};zoom:number;centerError:number;tick:number;lifeId:number|null;lifeState:string|null} {
  const self=this.view?.participants.find(p=>p.participantId===this.selfId),avatar=self&&this.avatars.get(self.participantId)?.container,camera=this.cameras.main;
  return {renderedAt:this.renderedAt,camera:{x:camera.scrollX,y:camera.scrollY},zoom:camera.zoom,centerError:avatar?Math.hypot(avatar.x-camera.midPoint.x,avatar.y-camera.midPoint.y):0,tick:this.view?.tick??0,lifeId:self?.lifeId??null,lifeState:self?.lifeState??null};
 }
 destroyGame():void {this.game.destroy(true);}
}
export function createRenderer(parent:string):GameScene {
 const scene=new GameScene();
 new Phaser.Game({type:Phaser.AUTO,parent,backgroundColor:'#e6e3d9',width:window.innerWidth,height:window.innerHeight,
  scale:{mode:Phaser.Scale.NONE,autoCenter:Phaser.Scale.NO_CENTER},
  scene:[scene],render:{antialias:true,powerPreference:'high-performance'},banner:false,audio:{noAudio:true}});
 return scene;
}





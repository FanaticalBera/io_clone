import {SLOT_COLORS,participantRenderColors} from './player-colors.js';
import {shuffledBotMarkers} from './bot-cosmetics.js';
import {DEFAULT_IMAGE_MARKER_DIAMETER,type ImageMarkerDiameter} from './marker-size-experiment.js';
import {MARKERS,markerAssetUrl} from './catalog.js';
import {PlayerMarker} from './player-marker.js';
import {DEFAULT_MARKER_APPEARANCE,type MarkerAppearance} from './marker-art.js';
import Phaser from 'phaser';
import {Presentation} from './presentation.js';
import {CombatEffects} from './combat-effects.js';
import {TerritoryEffects} from './territory-effects.js';
import {TerritoryCaptureEffects} from './territory-capture-effects.js';
import type {TerritoryEffectStyle} from './territory-effect-model.js';
import {nearbyBoundaryEdges,boundaryGeometry,setWallMargin,movementCell} from '../shared/wall-margin.js';
import {createMap} from '../shared/hex.js';
import type {MatchView,MapDefinition,Vec} from '../shared/model.js';
import {GAME_MODES} from '../shared/modes.js';
import {gameplayZoom,MOUSE_DEAD_ZONE} from './controls.js';
import {renderPixelRatio} from './render-viewport.js';
import {slotBit} from '../shared/slots.js';
import {indexRenderChunks,type RenderChunk} from './render-chunks.js';
import {FIELD,INK,mixColor} from './theme.js';
export {SLOT_COLORS as COLORS} from './player-colors.js';
const cssColor=(color:number)=>'#'+color.toString(16).padStart(6,'0');
export class GameScene extends Phaser.Scene {
 view:MatchView|null=null;selfId:string|null=null;map:MapDefinition|null=null;
 private boundaryHighlight=true;
 setBoundaryHighlight(enabled:boolean):void{this.boundaryHighlight=enabled;if(!enabled)this.wallHighlight?.clear();}
 private wallMargin=true;private wallHighlight?:Phaser.GameObjects.Graphics;private highlightedEdges=0;private board?:Phaser.GameObjects.Graphics;private boardKey='';
 setWallMargin(enabled:boolean):void {this.wallMargin=enabled;this.presentation.setWallMargin(enabled);if(!enabled){this.wallHighlight?.clear();this.highlightedEdges=0;}}
 wallVisualState(){return {enabled:this.wallMargin,highlight:this.boundaryHighlight,edges:this.highlightedEdges,graphics:(this.wallHighlight?1:0)+(this.board?1:0)};}
 private presentation=new Presentation();private online=false;private predictedLine?:Phaser.GameObjects.Graphics;
 private groundChunks=new Map<string,Phaser.GameObjects.Blitter>();private boundary?:Phaser.GameObjects.Graphics;private groundKey='';
 private chunkIndex=new Map<string,RenderChunk>();private cellChunkKeys:string[]=[];private cullChunks=true;
 private chunks=new Map<string,Phaser.GameObjects.Graphics>();
 private lastOwners=new Uint8Array();private lastTrails=new Uint16Array();
 private miniLayer?:HTMLCanvasElement;private miniPaths:Path2D[]=[];private miniOwners=new Uint8Array();
 private metrics={mapInitMs:0,groundPreparationMs:0,territoryRedrawMs:0,minimapUpdateMs:0,minimapPreparationMs:0};
 private avatars=new Map<string,{container:Phaser.GameObjects.Container;marker:PlayerMarker;shield:Phaser.GameObjects.Arc;label:Phaser.GameObjects.Text}>();
 private markerImageDiameter:ImageMarkerDiameter=DEFAULT_IMAGE_MARKER_DIAMETER;
 setMarkerImageDiameter(value:ImageMarkerDiameter):void {if(this.markerImageDiameter===value)return;this.markerImageDiameter=value;this.setMarkerAppearance(this.markerAppearance);}
 private markerAppearance:MarkerAppearance={...DEFAULT_MARKER_APPEARANCE};
 setMarkerAppearance(value:MarkerAppearance):void {this.markerAppearance={...value};if(this.created&&this.view)this.drawView(this.view,false,this.view);}
 // Canvas text keeps its fallback face until it is redrawn after web fonts load.
 refreshLabels():void {for(const avatar of this.avatars.values())avatar.label.updateText();}
 refreshColors():void {this.colorKey='';if(this.created&&this.view)this.drawView(this.view,false,this.view);}
 private renderColors=[...SLOT_COLORS];private colorKey='';private cosmeticMatch='';private botMarkerIds:readonly string[]=[];
 playerColors():readonly number[]{return this.renderColors;}
 private syncCosmetics(view:MatchView):boolean {
  if(this.cosmeticMatch!==view.matchId){this.cosmeticMatch=view.matchId;this.botMarkerIds=shuffledBotMarkers(view.matchId);}
  const next=participantRenderColors(view,this.selfId,this.markerAppearance.markerColorId,this.online),key=next.join(':');
  if(this.colorKey===key)return false;this.colorKey=key;this.renderColors.splice(0,this.renderColors.length,...next);this.miniOwners.fill(255);return true;
 }
 markerState(){return [...this.avatars].map(([participantId,a])=>({participantId,...a.marker.state()}));}
 private followTarget:Phaser.GameObjects.Container|null=null;
 private renderedAt=0;
 private viewportWidth=window.innerWidth;private viewportHeight=window.innerHeight;private pixelRatio=1;
 private combat?:CombatEffects;private territoryEffects?:TerritoryEffects;private territoryStyle:TerritoryEffectStyle='NONE';
 private captureEffects?:TerritoryCaptureEffects;private captureEnabled=false;
 private killFeedback:()=>void=()=>{};
 setKillFeedback(callback:()=>void):void{this.killFeedback=callback;}
 private deathFeedback:()=>void=()=>{};
 setDeathFeedback(callback:()=>void):void{this.deathFeedback=callback;}
 private points:Phaser.GameObjects.Text[]=[];private lastMini=0;private created=false;
 constructor(){super('game');}
 preload():void {for(const marker of MARKERS)if(marker.renderType==='IMAGE')for(const key of [marker.assetKey,marker.detailAssetKey])if(key&&!this.textures.exists(key))this.load.image(key,markerAssetUrl(key));}
 markerAssetsState(){return {textureKeys:this.textures.getTextureKeys().filter(key=>key.startsWith('marker-')).sort(),avatars:this.avatars.size,imageObjects:[...this.avatars.values()].reduce((count,a)=>count+a.marker.container.list.filter(child=>child.type==='Image').length,0)};}
 create():void {this.created=true;this.cameras.main.setBackgroundColor(FIELD.table);this.trackViewport();this.combat=new CombatEffects(this,this.renderColors,()=>this.killFeedback(),()=>this.deathFeedback());this.combat.setViewport(this.viewportWidth,this.viewportHeight,this.pixelRatio);this.territoryEffects=new TerritoryEffects(this);this.territoryEffects.setStyle(this.territoryStyle);this.captureEffects=new TerritoryCaptureEffects(this);this.captureEffects.setEnabled(this.captureEnabled);if(this.view){this.drawView(this.view,true);this.combat.accept(this.view,this.selfId,true);}}
 private cssZoom():number{return this.selfId?gameplayZoom(this.viewportWidth):Math.min(this.viewportWidth/2200,this.viewportHeight/2200);}
 private trackViewport():void {
  const parent=this.game.canvas.parentElement!;let frame=0;const abort=new AbortController();
  const fit=()=>{frame=0;const rect=parent.getBoundingClientRect(),width=Math.round(rect.width),height=Math.round(rect.height);if(width<1||height<1)return;
   const ratio=renderPixelRatio(width,height,window.devicePixelRatio),backingWidth=Math.round(width*ratio),backingHeight=Math.round(height*ratio);
   this.viewportWidth=width;this.viewportHeight=height;this.pixelRatio=ratio;
   // Phaser 3 renders in backing pixels. Counter-scale the canvas in CSS and
   // multiply the camera zoom, keeping world size and visible area unchanged.
   if(this.scale.zoom!==1/ratio)this.scale.setZoom(1/ratio);
   if(this.scale.width!==backingWidth||this.scale.height!==backingHeight)this.scale.resize(backingWidth,backingHeight);
   Object.assign(this.game.canvas.style,{width:width+'px',height:height+'px',marginLeft:'0px',marginTop:'0px'});
   this.scale.updateBounds();
   this.cameras.main.setZoom(this.cssZoom()*ratio);if(!this.selfId)this.cameras.main.centerOn(0,0);
   for(const avatar of this.avatars.values())avatar.label.setResolution(ratio).setScale(Math.max(1,.7/gameplayZoom(width)));
   for(const point of this.points)point.setResolution(ratio);
   this.combat?.setViewport(width,height,ratio);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(fit);};const observer=new ResizeObserver(schedule);observer.observe(parent);
  window.addEventListener('resize',schedule,{signal:abort.signal});window.addEventListener('orientationchange',schedule,{signal:abort.signal});window.visualViewport?.addEventListener('resize',schedule,{signal:abort.signal});
  const cleanup=()=>{observer.disconnect();abort.abort();cancelAnimationFrame(frame);};this.events.once(Phaser.Scenes.Events.SHUTDOWN,cleanup);this.events.once(Phaser.Scenes.Events.DESTROY,cleanup);fit();
 }
 setView(view:MatchView,selfId:string|null,online=false,reset=false):void {const previous=this.view;this.online=online;this.presentation.accept(view,selfId,performance.now(),reset,!online);this.view=view;this.selfId=selfId;if(this.created){this.drawView(view,reset||!selfId,previous??undefined);this.combat?.accept(view,selfId,reset);}}
 setLocalInput(direction:Vec,seq:number):void{this.presentation.input(direction,seq,performance.now());}
 freezePresentation():void{this.presentation.freeze();}
 private hex(g:Phaser.GameObjects.Graphics,id:number,fill:number,alpha:number,outline?:number):void {
  const origin=g.getData('origin') as Vec|undefined;const vertices=origin?this.map!.cells[id].vertices.map(v=>({x:v.x-origin.x,y:v.y-origin.y})):this.map!.cells[id].vertices;
  if(alpha){g.fillStyle(fill,alpha);g.fillPoints(vertices,true);}
  if(outline!==undefined){g.lineStyle(1,outline,0.8);g.strokePoints(vertices,true);}
 }
 // Raised-tile side: only the lower faces whose neighbour is not land show it.
 // Owned neighbours draw their own top over this area, so they are skipped.
 private lip(g:Phaser.GameObjects.Graphics,id:number,fill:number,owners:ArrayLike<number>):void {
  const c=this.map!.cells[id],origin=g.getData('origin') as Vec|undefined,ox=origin?.x??0,oy=origin?.y??0,d=this.map!.side*FIELD.lipDepth;
  // Vertex 1-2 is the SE face (neighbour 5), vertex 2-3 the SW face (neighbour 4).
  for(const [n,a,b]of [[5,1,2],[4,2,3]] as const){const next=c.neighbors[n];if(next>=0&&owners[next])continue;
   const va=c.vertices[a],vb=c.vertices[b];g.fillStyle(fill,1);
   g.fillPoints([{x:va.x-ox,y:va.y-oy},{x:vb.x-ox,y:vb.y-oy},{x:vb.x-ox,y:vb.y-oy+d},{x:va.x-ox,y:va.y-oy+d}],true);}
 }
 private strokeHex(g:Phaser.GameObjects.Graphics,id:number):void {const origin=g.getData('origin') as Vec|undefined;g.strokePoints(origin?this.map!.cells[id].vertices.map(v=>({x:v.x-origin.x,y:v.y-origin.y})):this.map!.cells[id].vertices,true);}
 private chunkKey(id:number):string {return this.cellChunkKeys[id];}
 private drawView(view:MatchView,reset=false,previous?:MatchView):void {
  const colorsChanged=this.syncCosmetics(view);
  if(!this.map||this.map.mapId!==view.mapId){
   const initAt=performance.now();
   this.map=createMap(view.config.mapRadius,view.config.hexSideWorldUnits);
   for(const g of this.groundChunks.values())g.destroy();this.groundChunks.clear();this.boundary?.destroy();
   if(this.groundKey)this.textures.remove(this.groundKey);
   for(const g of this.chunks.values())g.destroy();this.chunks.clear();
   for(const text of this.points)text.destroy();this.points=[];
   const index=indexRenderChunks(this.map);this.chunkIndex=index.chunks;this.cellChunkKeys=index.keys;this.territoryEffects?.setMap(this.map,this.chunkIndex);this.captureEffects?.setMap(this.map,this.chunkIndex);reset=true;
   const groundAt=performance.now();
   // All cells share one tiny hex texture. Prebuilt Blitter chunks batch fixed
   // quads instead of tessellating thousands of Graphics paths every frame.
   const side=this.map.side,minX=Math.floor(-Math.sqrt(3)*side/2)-2,minY=-Math.ceil(side)-2;
   const width=Math.ceil(Math.sqrt(3)*side/2)-minX+2,height=Math.ceil(side)-minY+2;
   const prototype=this.add.graphics().setVisible(false),center=this.map.cells[0].center;
   const vertices=this.map.cells[0].vertices.map(v=>({x:v.x-center.x-minX,y:v.y-center.y-minY}));
   prototype.fillStyle(FIELD.ground,1).fillPoints(vertices,true);prototype.lineStyle(1,FIELD.groundLine,1).strokePoints(vertices,true);
   this.groundKey='ground-hex-'+this.map.mapId;prototype.generateTexture(this.groundKey,width,height);prototype.destroy();
   for(const [key,chunk]of this.chunkIndex){
    const ground=this.add.blitter(0,0,this.groundKey).setDepth(0);for(const id of chunk.cells){const c=this.map.cells[id];ground.create(c.center.x+minX,c.center.y+minY);}
    ground.getRenderList();
    this.groundChunks.set(key,ground);this.chunks.set(key,this.add.graphics().setDepth(1));
   }
   this.boundary=this.add.graphics().setDepth(0).lineStyle(3,FIELD.edgeLine,1);
   for(const e of this.map.boundaryEdges)this.boundary.lineBetween(e.a.x,e.a.y,e.b.x,e.b.y);
   this.metrics.groundPreparationMs=performance.now()-groundAt;
   for(const cp of this.map.controlPoints){const c=this.map.cells[cp.cellId];this.points.push(this.add.text(c.center.x,c.center.y,'◆ '+(cp.pointId+1),{fontFamily:'sans-serif',fontSize:'19px',fontStyle:'bold',color:'#142330',backgroundColor:'#ffce70',padding:{x:9,y:8},resolution:this.pixelRatio}).setOrigin(0.5).setDepth(4));}
   this.lastOwners=new Uint8Array(this.map.cells.length).fill(255);this.lastTrails=new Uint16Array(this.map.cells.length);
   this.miniLayer=undefined;this.miniPaths=[];this.miniOwners=new Uint8Array();this.lastMini=-Infinity;
   this.metrics.minimapPreparationMs=0;
   this.metrics.mapInitMs=performance.now()-initAt;
  }
  const redrawAt=performance.now();
  const dirty=new Set<string>();if(colorsChanged||reset)for(const key of this.chunkIndex.keys())dirty.add(key);
  for(let id=0;id<view.owners.length;id++)if(this.lastOwners[id]!==view.owners[id]||this.lastTrails[id]!==view.trailMasks[id])dirty.add(this.chunkKey(id));
  for(const key of dirty){
   const g=this.chunks.get(key)!;g.clear();
   const cells=this.chunkIndex.get(key)!.cells;
   // Flat trails first, then raised land: land always sits above a trail.
   for(const id of cells){const mask=view.trailMasks[id];if(!mask)continue;
    for(let slot=0;slot<view.config.maxSlots;slot++)if(mask&slotBit(slot)){
     // The entire traversed hex is vulnerable; keep it visibly lighter than captured land.
     const color=this.renderColors[slot];this.hex(g,id,color,FIELD.trailAlpha);g.lineStyle(1.5,color,FIELD.trailLineAlpha);this.strokeHex(g,id);
    }
   }
   for(const id of cells){const owner=view.owners[id];if(!owner)continue;const color=this.renderColors[owner-1];
    this.lip(g,id,mixColor(color,INK,FIELD.lipShade),view.owners);this.hex(g,id,color,1);g.lineStyle(1,mixColor(color,INK,FIELD.territoryEdge),1);this.strokeHex(g,id);
   }
  }
  this.territoryEffects?.accept(view,this.lastOwners,this.cellChunkKeys,this.renderColors,performance.now(),reset,previous);
  this.captureEffects?.accept(view,this.lastOwners,this.cellChunkKeys,this.renderColors,performance.now(),reset,previous);
  this.lastOwners.set(view.owners);this.lastTrails.set(view.trailMasks);
  this.metrics.territoryRedrawMs=performance.now()-redrawAt;
  const present=new Set(view.participants.map(p=>p.participantId));
  for(const [id,avatar]of this.avatars)if(!present.has(id)){avatar.container.destroy();this.avatars.delete(id);}
  for(const p of view.participants){
   let avatar=this.avatars.get(p.participantId);
   if(!avatar){
    const shield=this.add.circle(0,0,28,0x101b29,0).setStrokeStyle(3,this.renderColors[p.slot],0.9);
    const marker=new PlayerMarker(this);
    const self=p.participantId===this.selfId,label=this.add.text(0,-43,p.nickname,{fontFamily:'Jua, Gothic A1, sans-serif',fontSize:self?'14px':'12px',color:'#ffffff',backgroundColor:self?'#1f1b2d':'#1f1b2d8c',padding:{x:7,y:3},resolution:this.pixelRatio}).setOrigin(0.5);
    const container=this.add.container(p.position.x,p.position.y,[shield,marker.container,label]).setDepth(5);
    avatar={container,marker,shield,label};this.avatars.set(p.participantId,avatar);
   }
   const appearance=p.kind==='BOT'?{markerId:this.botMarkerIds[p.slot%this.botMarkerIds.length]??'default',markerColorId:'slot'}:this.markerAppearance;
   avatar.marker.set(appearance,this.renderColors[p.slot],p.participantId===this.selfId,this.markerImageDiameter,p.kind==='BOT');
   avatar.shield.setStrokeStyle(3,this.renderColors[p.slot],.9);
   avatar.container.setVisible(p.lifeState==='ALIVE');
   avatar.label.setText(p.nickname);
   avatar.label.setScale(Math.max(1,.7/gameplayZoom(this.viewportWidth)));
   // Positions are applied only in the render update, keeping camera and avatar on one frame.
   avatar.shield.setVisible(p.protected);
   if(p.participantId===this.selfId){
    // startFollow recenters immediately; restarting it for every snapshot causes camera shake.
    if(this.followTarget!==avatar.container){this.followTarget=avatar.container;this.cameras.main.startFollow(avatar.container,false,1,1);}
   }
  }
  for(const [i,cp]of this.map.controlPoints.entries()){const owner=view.owners[cp.cellId];this.points[i].setVisible(GAME_MODES[view.gameMode.id].usesControlPoints).setBackgroundColor(owner?cssColor(this.renderColors[owner-1]):'#ffce70');}
  if(!this.selfId){this.followTarget=null;this.cameras.main.stopFollow();this.cameras.main.centerOn(0,0);}
  this.cameras.main.setZoom(this.cssZoom()*this.pixelRatio);
  document.querySelector('#field')?.setAttribute('data-chunks',String(this.chunks.size));
  document.querySelector('#field')?.setAttribute('data-avatars',String(this.avatars.size));
  document.querySelector('#field')?.setAttribute('data-ground-chunks',String(this.groundChunks.size));
  document.querySelector('#field')?.setAttribute('data-territory-effect',this.territoryStyle);
  document.querySelector('#field')?.setAttribute('data-capture-effect',this.captureEnabled?'CAPTURE_PULSE':'NONE');
 }
 update(time:number):void {
  if(!this.map||!this.view)return;
  const now=performance.now();this.renderedAt=now;
  this.combat?.update(now);this.territoryEffects?.update(now,this.view,this.cullChunks);this.captureEffects?.update(now,this.view,this.cullChunks);
  for(const [id,avatar]of this.avatars){const position=this.presentation.position(id,now);if(position)avatar.container.setPosition(position.x,position.y);}
  setWallMargin(this.map,this.wallMargin);
  const boardKey=this.map.mapId+':'+this.wallMargin;
  if(this.boardKey!==boardKey){this.boardKey=boardKey;this.drawBoard();}
  this.highlightedEdges=0;this.wallHighlight?.clear();
  const wallSelf=this.view.participants.find(p=>p.participantId===this.selfId);
  if(this.boundaryHighlight&&wallSelf&&this.view.phase==='RUNNING'){
   const position=this.presentation.position(wallSelf.participantId,now)??wallSelf.position;
   const edges=nearbyBoundaryEdges(this.map,position,Math.sqrt(3)*this.map.side*3);
   if(edges.length){this.wallHighlight??=this.add.graphics().setDepth(3);this.wallHighlight.lineStyle(5,FIELD.nearEdge,.95);for(const edge of edges)this.wallHighlight.lineBetween(edge.a.x,edge.a.y,edge.b.x,edge.b.y);this.highlightedEdges=edges.length;const radius=Math.sqrt(3)*this.map.side*3;if(this.wallMargin){const near=boundaryGeometry(this.map).edges.filter(edge=>Math.min(Math.hypot(edge.a.x-position.x,edge.a.y-position.y),Math.hypot(edge.b.x-position.x,edge.b.y-position.y))<=radius);
    // The lethal board edge glows: a soft wide pass under a solid one.
    for(const [width,alpha]of [[18,.3],[7,1]] as const){this.wallHighlight.lineStyle(width,FIELD.nearDeath,alpha);for(const edge of near)this.wallHighlight.lineBetween(edge.a.x,edge.a.y,edge.b.x,edge.b.y);}}}
  }
  const camera=this.cameras.main,margin=16*Math.sqrt(3)*this.map.side;
  // camera.worldView is the last completed frame; one whole chunk margin also
  // covers normal movement before the next camera pre-render.
  const rect=camera.worldView;
  for(const [key,chunk]of this.chunkIndex){const visible=!this.cullChunks||(chunk.maxX>=rect.x-margin&&chunk.minX<=rect.right+margin&&chunk.maxY>=rect.y-margin&&chunk.minY<=rect.bottom+margin);
   this.groundChunks.get(key)!.setVisible(visible);this.chunks.get(key)!.setVisible(visible);
  }
  if(this.online){
   this.predictedLine??=this.add.graphics().setDepth(3);this.predictedLine.clear();
   const self=this.view.participants.find(p=>p.participantId===this.selfId),position=self&&this.presentation.position(self.participantId,now);
   if(self?.lifeState==='ALIVE'&&position&&this.view.phase==='RUNNING'){
    const cell=movementCell(this.map,position);if(cell>=0&&this.view.owners[cell]!==self.slot+1){
     // The unconfirmed head cell is a quieter preview, replaced by the next snapshot.
     if(!(this.view.trailMasks[cell]&slotBit(self.slot)))this.hex(this.predictedLine,cell,this.renderColors[self.slot],0.13);
    }
   }
  }else this.predictedLine?.clear();
  if(time-this.lastMini<250)return;this.lastMini=time;
  const canvas=document.querySelector<HTMLCanvasElement>('#minimap');if(!canvas||canvas.hidden)return;
  const context=canvas.getContext('2d');if(!context)return;
  const miniAt=performance.now();
  const width=240,height=204,backingWidth=Math.max(width,Math.round(canvas.clientWidth*this.pixelRatio)),backingHeight=Math.max(height,Math.round(canvas.clientHeight*this.pixelRatio));
  if(backingWidth<1||backingHeight<1)return;
  if(canvas.width!==backingWidth||canvas.height!==backingHeight){canvas.width=backingWidth;canvas.height=backingHeight;}
  context.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
  const scale=Math.min((width-20)/(Math.sqrt(3)*this.map.side*(this.map.radius*2+1)),(height-20)/(this.map.side*(this.map.radius*3+2)));
  context.clearRect(0,0,width,height);
  const prepareMini=!this.miniLayer||this.miniLayer.width!==backingWidth||this.miniLayer.height!==backingHeight;
  if(prepareMini){
   this.miniLayer=document.createElement('canvas');this.miniLayer.width=backingWidth;this.miniLayer.height=backingHeight;
   this.miniOwners=new Uint8Array(this.map.cells.length).fill(255);
   this.miniPaths=this.map.cells.map(c=>{const path=new Path2D();c.vertices.forEach((v,i)=>{const x=width/2+v.x*scale,y=height/2+v.y*scale;if(i===0)path.moveTo(x,y);else path.lineTo(x,y);});path.closePath();return path;});
  }
  const layer=this.miniLayer!.getContext('2d')!;layer.setTransform(backingWidth/width,0,0,backingHeight/height,0,0);
  const miniDirty=new Set<number>();
  for(const c of this.map.cells)if(this.miniOwners[c.id]!==this.view.owners[c.id]){miniDirty.add(c.id);for(const id of c.neighbors)if(id>=0)miniDirty.add(id);}
  for(const id of miniDirty){const owner=this.view.owners[id];layer.fillStyle=owner?cssColor(this.renderColors[owner-1]):'#eef1f6';layer.strokeStyle='#dde3ec';layer.lineWidth=.35;layer.fill(this.miniPaths[id]);layer.stroke(this.miniPaths[id]);}
  this.miniOwners.set(this.view.owners);context.drawImage(this.miniLayer!,0,0,width,height);
  if(prepareMini)this.metrics.minimapPreparationMs=performance.now()-miniAt;
  if(GAME_MODES[this.view!.gameMode.id].usesControlPoints)for(const cp of this.map.controlPoints){const c=this.map.cells[cp.cellId],x=width/2+c.center.x*scale,y=height/2+c.center.y*scale;context.fillStyle='#ffb43b';context.beginPath();context.moveTo(x,y-3);context.lineTo(x+3,y);context.lineTo(x,y+3);context.lineTo(x-3,y);context.closePath();context.fill();}
  const self=this.view.participants.find(p=>p.participantId===this.selfId);if(self?.lifeState==='ALIVE'){const position=this.presentation.position(self.participantId,now)??self.position,x=width/2+position.x*scale,y=height/2+position.y*scale;context.fillStyle='#ffffff';context.strokeStyle='#1f1b2d';context.lineWidth=3;context.beginPath();context.arc(x,y,7,0,Math.PI*2);context.fill();context.stroke();}
  this.metrics.minimapUpdateMs=performance.now()-miniAt;
 }
 // The playable map is a board on an indigo table: a thick side below the
 // lethal edge, the edge line itself, then the survivable rim up to the cells.
 private drawBoard():void {
  const map=this.map!,geometry=this.wallMargin?boundaryGeometry(map):null,edges=geometry?.edges??map.boundaryEdges,t=map.side*FIELD.boardThickness;
  this.board??=this.add.graphics().setDepth(-.1);const g=this.board.clear();
  g.fillStyle(FIELD.boardSide,1);for(const e of edges)g.fillPoints([e.a,e.b,{x:e.b.x,y:e.b.y+t},{x:e.a.x,y:e.a.y+t}],true);
  g.lineStyle(12,FIELD.boardEdge,1);for(const e of edges)g.lineBetween(e.a.x,e.a.y,e.b.x,e.b.y);
  if(geometry){g.fillStyle(FIELD.rim,1);for(const poly of geometry.polygons)g.fillPoints(poly,true);}
 }
 pointerDirection(x:number,y:number):Vec|null {
  const p=this.view?.participants.find(p=>p.participantId===this.selfId);if(!p)return null;
  // The camera maps the last rendered frame. Use the avatar from that same
  // frame; a newer predicted position would shift the control centre between
  // frames, especially when rendering is slow.
  const target=this.cameras.main.getWorldPoint(x*this.scale.width/this.viewportWidth,y*this.scale.height/this.viewportHeight),position=this.avatars.get(p.participantId)?.container??p.position;
  const vector={x:target.x-position.x,y:target.y-position.y};return Math.hypot(vector.x,vector.y)*this.cssZoom()<MOUSE_DEAD_ZONE?null:vector;
 }
 setTerritoryEffect(style:TerritoryEffectStyle):void{this.territoryStyle=style;this.territoryEffects?.setStyle(style);if(this.view)this.drawView(this.view,true);}
 territoryEffectState(){return this.territoryEffects?.state()??null;}
 setCaptureEffect(enabled:boolean):void{this.captureEnabled=enabled;this.captureEffects?.setEnabled(enabled);if(this.view)this.drawView(this.view,true);}
 captureEffectState(){return this.captureEffects?.state()??null;}
 combatState():ReturnType<CombatEffects['state']>|null{return this.combat?.state()??null;}
 resourceState(){const source=this.groundKey?this.textures.get(this.groundKey).source[0]:undefined;return {...this.metrics,groundChunks:this.groundChunks.size,territoryChunks:this.chunks.size,visibleGroundChunks:[...this.groundChunks.values()].filter(g=>g.visible).length,textures:this.textures.getTextureKeys().length,groundTextures:source?1:0,groundTextureSize:source?{width:source.width,height:source.height}:null,groundCells:[...this.groundChunks.values()].reduce((n,g)=>n+g.children.length,0),avatars:this.avatars.size,culling:this.cullChunks};}
 setChunkCulling(enabled:boolean):void{this.cullChunks=enabled;}
 testCamera(x:number,y:number):void{this.cameras.main.stopFollow();this.followTarget=null;this.cameras.main.centerOn(x,y);}
 renderState():{renderedAt:number;camera:{x:number;y:number};zoom:number;pixelRatio:number;backing:{width:number;height:number};viewport:{width:number;height:number};centerError:number;tick:number;lifeId:number|null;lifeState:string|null} {
  const self=this.view?.participants.find(p=>p.participantId===this.selfId),avatar=self&&this.avatars.get(self.participantId)?.container,camera=this.cameras.main;
  return {renderedAt:this.renderedAt,camera:{x:camera.scrollX,y:camera.scrollY},zoom:camera.zoom/this.pixelRatio,pixelRatio:this.pixelRatio,backing:{width:this.game.canvas.width,height:this.game.canvas.height},viewport:{width:this.viewportWidth,height:this.viewportHeight},centerError:avatar?Math.hypot(avatar.x-camera.midPoint.x,avatar.y-camera.midPoint.y):0,tick:this.view?.tick??0,lifeId:self?.lifeId??null,lifeState:self?.lifeState??null};
 }
 destroyGame():void {this.game.destroy(true);}
}
export function createRenderer(parent:string):GameScene {
 const scene=new GameScene();
 new Phaser.Game({type:Phaser.AUTO,parent,backgroundColor:FIELD.table,width:window.innerWidth,height:window.innerHeight,
  scale:{mode:Phaser.Scale.NONE,autoCenter:Phaser.Scale.NO_CENTER},
  scene:[scene],render:{antialias:true,powerPreference:'high-performance'},banner:false,audio:{noAudio:true}});
 return scene;
}





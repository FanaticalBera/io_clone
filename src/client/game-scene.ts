import {SLOT_COLORS,participantRenderColors} from './player-colors.js';
import {shuffledBotMarkers} from './bot-cosmetics.js';
import {PlayerMarker} from './player-marker.js';
import {MarkerTrails,TRAIL_MARKER_IDS,hasTrail} from './marker-trails.js';
import {CAPTURE_THEMES} from './capture-themes.js';
// Dev only: ?trailPreview=1 dresses every bot in a premium marker to review trails.
const TRAIL_PREVIEW=import.meta.env.DEV&&new URLSearchParams(location.search).get('trailPreview')==='1';
import {DEFAULT_MARKER_APPEARANCE,type MarkerAppearance} from './marker-art.js';
import Phaser from 'phaser';
import {Presentation} from './presentation.js';
import {CombatEffects} from './combat-effects.js';
import {TerritoryEffects} from './territory-effects.js';
import {TerritoryCaptureEffects} from './territory-capture-effects.js';
import type {TerritoryEffectStyle} from './territory-effect-model.js';
import {nearbyBoundaryEdges,boundaryGeometry,setWallMargin,movementCell} from '../shared/wall-margin.js';
import {createMap,worldCell} from '../shared/hex.js';
import type {MatchView,MapDefinition,Vec} from '../shared/model.js';
import {GAME_MODES} from '../shared/modes.js';
import {gameplayZoom,MOUSE_DEAD_ZONE} from './controls.js';
import {renderPixelRatio} from './render-viewport.js';
import {slotBit} from '../shared/slots.js';
import {indexRenderChunks,cullMargin,type RenderChunk} from './render-chunks.js';
import {FIELD,INK,mixColor} from './theme.js';
import {perfNow,perfAdd} from '../shared/perf-sink.js';
import {startFrameMeter} from './frame-meter.js';
import {installFrameLimit} from './frame-limit.js';
import {PERF_BUILD} from './perf-build.js';
export {SLOT_COLORS as COLORS} from './player-colors.js';
const cssColor=(color:number)=>'#'+color.toString(16).padStart(6,'0');
const bounds=(points:Vec[],pad:number)=>({minX:Math.min(...points.map(p=>p.x))-pad,minY:Math.min(...points.map(p=>p.y))-pad,maxX:Math.max(...points.map(p=>p.x))+pad,maxY:Math.max(...points.map(p=>p.y))+pad});
// Measurement builds can lower the backing-pixel cap (?perfMaxDpr=2) to compare heat and sharpness (PRD Q6).
const MAX_RENDER_RATIO=PERF_BUILD&&Number(new URLSearchParams(location.search).get('perfMaxDpr'))>=1?Number(new URLSearchParams(location.search).get('perfMaxDpr')):3;
export class GameScene extends Phaser.Scene {
 view:MatchView|null=null;selfId:string|null=null;map:MapDefinition|null=null;
 private boundaryHighlight=true;private botDebugFollowId:string|null=null;
 setBotDebugFollow(id:string|null):void{this.botDebugFollowId=id;if(this.created&&this.view)this.drawView(this.view,false);}
 isBotDebugFollowing():boolean{return this.botDebugFollowId!==null;}
 private debugOverlay?:Phaser.GameObjects.Graphics;
 private debugOverlayData:{matchId:string;damage:number[];expected:number[];actual:number[];slot:number;route?:number[];destination?:number|null}|null=null;
 setBotDebugOverlay(data:typeof this.debugOverlayData):void {
  this.debugOverlayData=data;if(!this.created||!this.map)return;
  if(!data||data.matchId!==this.view?.matchId){this.debugOverlay?.clear().setVisible(false);return;}
  if(!this.debugOverlay){this.debugOverlay=this.add.graphics().setDepth(6);const clear=()=>{this.debugOverlay?.destroy();this.debugOverlay=undefined;this.debugOverlayData=null;};this.events.once(Phaser.Scenes.Events.SHUTDOWN,clear);}
  const g=this.debugOverlay;g.clear().setVisible(true);
  for(const [ids,color,width,fill]of [[data.damage,0xffd54a,2,0],[data.expected,0x42dbff,4,.15],[data.actual,0x61ff92,3,.20]] as const){
   g.lineStyle(width,color,1);for(const id of ids){const cell=this.map.cells[id];if(!cell||(color===0x61ff92&&this.view?.owners[id]!==data.slot+1))continue;if(fill)g.fillStyle(color,fill).fillPoints(cell.vertices,true);g.strokePoints(cell.vertices,true);}
  }
  g.lineStyle(2,0xfb923c,1);for(const id of data.route??[]){const cell=this.map.cells[id];if(cell)g.strokePoints(cell.vertices,true);}
  if(data.destination!=null){const cell=this.map.cells[data.destination];if(cell){g.fillStyle(0xfb923c,.35).fillPoints(cell.vertices,true);g.lineStyle(5,0xfb923c,1).strokePoints(cell.vertices,true);}}
 }
 botDebugOverlayState(){return {enabled:!!this.debugOverlay?.visible,damage:this.debugOverlayData?.damage.length??0,expected:this.debugOverlayData?.expected.length??0,actual:this.debugOverlayData?.actual.length??0,route:this.debugOverlayData?.route?.length??0,destination:this.debugOverlayData?.destination??null};}

 setBoundaryHighlight(enabled:boolean):void{this.boundaryHighlight=enabled;if(!enabled)this.wallHighlight?.clear();}
 private wallMargin=true;private wallHighlight?:Phaser.GameObjects.Graphics;private highlightedEdges=0;private boardKey='';private boardParts:{graphics:Phaser.GameObjects.Graphics[];minX:number;minY:number;maxX:number;maxY:number}[]=[];private boundaryParts:{graphics:Phaser.GameObjects.Graphics[];minX:number;minY:number;maxX:number;maxY:number}[]=[];
 setWallMargin(enabled:boolean):void {this.wallMargin=enabled;this.presentation.setWallMargin(enabled);if(!enabled){this.wallHighlight?.clear();this.highlightedEdges=0;}}
 wallVisualState(){return {enabled:this.wallMargin,highlight:this.boundaryHighlight,edges:this.highlightedEdges,graphics:(this.wallHighlight?1:0)+(this.boardParts.length?1:0)};}
 private presentation=new Presentation();private online=false;private predictedLine?:Phaser.GameObjects.Graphics;
 private groundChunks=new Map<string,Phaser.GameObjects.Blitter>();private groundKey='';
 private chunkIndex=new Map<string,RenderChunk>();private cellChunkKeys:string[]=[];private cullChunks=true;
 private chunks=new Map<string,Phaser.GameObjects.Graphics>();
 // Captured land is drawn from prebuilt tiles (performance PRD G1): Phaser re-triangulates every
 // Graphics path each frame, and territory Graphics were ~2/3 of render time. Per chunk: open-ground
 // trails (Graphics, under) -> land tiles (Blitter) -> trails over land (Graphics, above).
 private landChunks=new Map<string,Phaser.GameObjects.Blitter>();private trailTops=new Map<string,Phaser.GameObjects.Graphics>();
 private landKey='';private landAtlasKey='';private landBox={minX:0,minY:0,width:0,height:0};
 private lastOwners=new Uint8Array();private lastTrails=new Uint16Array();
 private miniLayer?:HTMLCanvasElement;private miniPaths:Path2D[]=[];private miniOwners=new Uint8Array();
 private metrics={mapInitMs:0,groundPreparationMs:0,territoryRedrawMs:0,minimapUpdateMs:0,minimapPreparationMs:0};
 private trails:MarkerTrails|null=null;private themedBlooms=new WeakSet<object>();
 /** New capture blooms by premium markers get their themed burst and tile bloom. */
 private themeCaptures():void{
  const effects=this.captureEffects,map=this.map;if(!effects||!this.trails||!map)return;
  const view=this.cameras.main.worldView,now=performance.now();
  for(const effect of effects.model.effects){
   if(this.themedBlooms.has(effect))continue;this.themedBlooms.add(effect);
   const local=effect.participantId===this.selfId,{x,y}=effect.origin;
   if(!local&&(x<view.x-200||x>view.right+200||y<view.y-200||y>view.bottom+200))continue;
   const cells=[...effect.chunks.values()].flat().map(c=>({x:map.cells[c.id].center.x,y:map.cells[c.id].center.y,delay:c.delay}));
   this.trails.capture(this.avatars.get(effect.participantId)?.marker.markerId??'',effect.origin,cells,local,effect.startedAt);
  }
 }
 private avatars=new Map<string,{container:Phaser.GameObjects.Container;marker:PlayerMarker;shield:Phaser.GameObjects.Arc;label:Phaser.GameObjects.Text;life:number;territory:number;alive:boolean}>();
 private markerAppearance:MarkerAppearance={...DEFAULT_MARKER_APPEARANCE};
 setMarkerAppearance(value:MarkerAppearance):void {this.markerAppearance={...value};if(this.created&&this.view)this.drawView(this.view,false,this.view);}
 // Canvas text keeps its fallback face until it is redrawn after web fonts load.
 refreshLabels():void {for(const avatar of this.avatars.values())avatar.label.updateText();}
 refreshColors():void {this.colorKey='';if(this.created&&this.view)this.drawView(this.view,false,this.view);}
 private renderColors=[...SLOT_COLORS];private colorKey='';private cosmeticMatch='';private botMarkerIds:readonly string[]=[];
 playerColors():readonly number[]{return this.renderColors;}
 private syncCosmetics(view:MatchView):boolean {
  if(this.cosmeticMatch!==view.matchId){this.cosmeticMatch=view.matchId;this.botMarkerIds=TRAIL_PREVIEW?TRAIL_MARKER_IDS:shuffledBotMarkers(view.matchId);}
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
 isReady():boolean{return this.created;}
 // Render policy (performance PRD 4, Q2). Live: Phaser draws every frame. Still: the current state is
 // drawn once more and Phaser's loop then sleeps until live again. Snapshot handling keeps running either
 // way, so waking shows the latest state without catching up.
 // Idle: an overlay (settings, run result, results) covers the live field. Drawing continues at a low
 // rate instead of stopping: restarting a stopped WebGL canvas stuttered for ~0.3 s after closing
 // settings on an S24+ (no JS work; the WebView rebuilds the canvas layer). 30 fps showed no stutter in
 // 8 closes, 10 fps still missed a frame now and then. ?perfIdleFps tunes it in measurement builds.
 private stillPending=false;private wantMode:'live'|'idle'|'still'='live';
 frameLimit:(fps:number)=>void=()=>{};liveFps=60;idleFps=30;
 setRenderMode(mode:'live'|'idle'|'still'):void {
  // Before boot the loop has not started; create() applies the wanted policy.
  this.wantMode=mode;if(!this.created)return;
  const loop=this.game.loop;
  if(mode!=='still'){this.stillPending=false;this.frameLimit(mode==='live'?this.liveFps:this.idleFps);if(!loop.running)loop.wake(true);return;}
  this.frameLimit(this.liveFps);
  // Only the switch from live draws the extra frame; repeated still requests keep it asleep.
  if(!loop.running||this.stillPending)return;
  this.stillPending=true;
 }
 renderLive():boolean{return this.game.loop.running&&!this.stillPending&&this.wantMode==='live';}
 afterRender():void {if(this.stillPending){this.stillPending=false;this.game.loop.sleep();}}
 markerAssetsState(){return {textureKeys:this.textures.getTextureKeys().filter(key=>key.startsWith('mk:')).sort(),avatars:this.avatars.size,readyMarkers:[...this.avatars.values()].filter(a=>a.marker.state()?.textureReady).length};}
 create():void {this.created=true;if(this.wantMode==='still')this.stillPending=true;else if(this.wantMode==='idle')this.frameLimit(this.idleFps);this.cameras.main.setBackgroundColor(FIELD.table);this.trackViewport();this.combat=new CombatEffects(this,this.renderColors,()=>this.killFeedback(),()=>this.deathFeedback(),id=>{const state=this.avatars.get(id)?.marker.state();return state?.textureReady?state.textureKey:null;});this.combat.setViewport(this.viewportWidth,this.viewportHeight,this.pixelRatio);this.territoryEffects=new TerritoryEffects(this);this.territoryEffects.setStyle(this.territoryStyle);this.captureEffects=new TerritoryCaptureEffects(this);this.captureEffects.setEnabled(this.captureEnabled);this.trails=new MarkerTrails(this);this.captureEffects.themedCapture=id=>hasTrail(this.avatars.get(id)?.marker.markerId??'');this.captureEffects.captureTheme=id=>CAPTURE_THEMES[this.avatars.get(id)?.marker.markerId??'']??null;if(this.view){this.drawView(this.view,true);this.combat.accept(this.view,this.selfId,true);}}
 private cssZoom():number{return (this.selfId||this.botDebugFollowId)?gameplayZoom(this.viewportWidth):Math.min(this.viewportWidth/2200,this.viewportHeight/2200);}
 private trackViewport():void {
  const parent=this.game.canvas.parentElement!;let frame=0;const abort=new AbortController();
  const fit=()=>{frame=0;const rect=parent.getBoundingClientRect(),width=Math.round(rect.width),height=Math.round(rect.height);if(width<1||height<1)return;
   const ratio=renderPixelRatio(width,height,window.devicePixelRatio,MAX_RENDER_RATIO),backingWidth=Math.round(width*ratio),backingHeight=Math.round(height*ratio);
   this.viewportWidth=width;this.viewportHeight=height;this.pixelRatio=ratio;
   // Phaser 3 renders in backing pixels. Counter-scale the canvas in CSS and
   // multiply the camera zoom, keeping world size and visible area unchanged.
   if(this.scale.zoom!==1/ratio)this.scale.setZoom(1/ratio);
   if(this.scale.width!==backingWidth||this.scale.height!==backingHeight)this.scale.resize(backingWidth,backingHeight);
   Object.assign(this.game.canvas.style,{width:width+'px',height:height+'px',marginLeft:'0px',marginTop:'0px'});
   this.scale.updateBounds();
   this.cameras.main.setZoom(this.cssZoom()*ratio);if(!this.selfId&&!this.botDebugFollowId)this.cameras.main.centerOn(0,0);
   for(const avatar of this.avatars.values())avatar.label.setResolution(ratio).setScale(Math.max(1,.7/gameplayZoom(width)));
   for(const point of this.points)point.setResolution(ratio);
   this.combat?.setViewport(width,height,ratio);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(fit);};const observer=new ResizeObserver(schedule);observer.observe(parent);
  window.addEventListener('resize',schedule,{signal:abort.signal});window.addEventListener('orientationchange',schedule,{signal:abort.signal});window.visualViewport?.addEventListener('resize',schedule,{signal:abort.signal});
  const cleanup=()=>{observer.disconnect();abort.abort();cancelAnimationFrame(frame);};this.events.once(Phaser.Scenes.Events.SHUTDOWN,cleanup);this.events.once(Phaser.Scenes.Events.DESTROY,cleanup);fit();
 }
 setView(view:MatchView,selfId:string|null,online=false,reset=false):void {const previous=this.view;this.online=online;this.presentation.accept(view,selfId,performance.now(),reset,!online);this.view=view;this.selfId=selfId;if(this.created){const span=perfNow();this.drawView(view,reset||(!selfId&&!this.botDebugFollowId&&previous?.matchId!==view.matchId),previous??undefined);perfAdd('recv.draw',span);this.combat?.accept(view,selfId,reset);if(this.debugOverlayData?.matchId!==view.matchId)this.setBotDebugOverlay(null);}}
 setLocalInput(direction:Vec,seq:number):void{this.presentation.input(direction,seq,performance.now());}
 freezePresentation():void{this.presentation.freeze();}
 setPracticePaused(paused:boolean):void{this.presentation.setLocalPaused(paused,performance.now());}
 private hex(g:Phaser.GameObjects.Graphics,id:number,fill:number,alpha:number,outline?:number):void {
  const origin=g.getData('origin') as Vec|undefined;const vertices=origin?this.map!.cells[id].vertices.map(v=>({x:v.x-origin.x,y:v.y-origin.y})):this.map!.cells[id].vertices;
  if(alpha){g.fillStyle(fill,alpha);g.fillPoints(vertices,true);}
  if(outline!==undefined){g.lineStyle(1,outline,0.8);g.strokePoints(vertices,true);}
 }
 /**
  * Builds the land tile atlas: per player colour a top (fill + edge line) and the two lower sides.
  * One texel per world unit, like the ground tiles: Phaser's Blitter renderer ignores object scale.
  * A colour change rebuilds it and redraws every chunk. Returns whether it changed.
  */
 private ensureLandAtlas():boolean {
  const map=this.map!;
  const wanted=map.mapId+':'+this.renderColors.join(',');if(wanted===this.landAtlasKey)return false;
  const side=map.side,d=side*FIELD.lipDepth,minX=Math.floor(-Math.sqrt(3)*side/2)-2,minY=-Math.ceil(side)-2;
  const width=Math.ceil(Math.sqrt(3)*side/2)-minX+2,height=Math.ceil(side+d)-minY+2,w=width,h=height;
  const c0=map.cells[0],v=c0.vertices.map(p=>({x:p.x-c0.center.x-minX,y:p.y-c0.center.y-minY}));
  const g=this.add.graphics().setVisible(false),faces:Record<string,[number,number]>={se:[1,2],sw:[2,3]};
  this.renderColors.forEach((color,slot)=>{
   const oy=slot*h,at=(col:number,p:{x:number;y:number})=>({x:p.x+col*w,y:p.y+oy});
   g.fillStyle(color,1).fillPoints(v.map(p=>at(0,p)),true).lineStyle(1,mixColor(color,INK,FIELD.territoryEdge),1).strokePoints(v.map(p=>at(0,p)),true);
   Object.values(faces).forEach(([a,b],i)=>{const va=at(i+1,v[a]),vb=at(i+1,v[b]);g.fillStyle(mixColor(color,INK,FIELD.lipShade),1).fillPoints([va,vb,{x:vb.x,y:vb.y+d},{x:va.x,y:va.y+d}],true);});
  });
  const key='land-'+(++this.landAtlasSerial);g.generateTexture(key,w*3,h*this.renderColors.length);g.destroy();
  const texture=this.textures.get(key);
  this.renderColors.forEach((_,slot)=>{texture.add('top'+slot,0,0,slot*h,w,h);texture.add('se'+slot,0,w,slot*h,w,h);texture.add('sw'+slot,0,2*w,slot*h,w,h);});
  for(const land of this.landChunks.values()){land.clear();land.setTexture(key);}
  if(this.landKey)this.textures.remove(this.landKey);
  this.landKey=key;this.landAtlasKey=wanted;this.landBox={minX,minY,width,height};
  return true;
 }
 private landAtlasSerial=0;
 // Raised-tile side: only the lower faces whose neighbour is not land show it.
 // Owned neighbours draw their own top over this area, so they are skipped.
 private lip(g:Phaser.GameObjects.Graphics,id:number,fill:number,owners:ArrayLike<number>):void {
  const c=this.map!.cells[id],origin=g.getData('origin') as Vec|undefined,ox=origin?.x??0,oy=origin?.y??0,d=this.map!.side*FIELD.lipDepth;
  // Vertex 1-2 is the SE face (neighbour 5), vertex 2-3 the SW face (neighbour 4).
  for(const [n,a,b]of [[5,1,2],[4,2,3]] as const){const next=c.neighbors[n];if(next>=0&&owners[next])continue;
   const va=c.vertices[a],vb=c.vertices[b];g.fillStyle(fill,1);
   g.fillPoints([{x:va.x-ox,y:va.y-oy},{x:vb.x-ox,y:vb.y-oy},{x:vb.x-ox,y:vb.y-oy+d},{x:va.x-ox,y:va.y-oy+d}],true);}
 }
 // The entire traversed hex is vulnerable; keep it visibly lighter than captured land.
 // Over land it is washed toward white first so the trail reads against any colour.
 private trail(g:Phaser.GameObjects.Graphics,id:number,mask:number,slots:number,onLand:boolean):void {
  for(let slot=0;slot<slots;slot++)if(mask&slotBit(slot)){const color=this.renderColors[slot];
   if(onLand){this.hex(g,id,0xffffff,FIELD.trailLandWash);this.hex(g,id,color,FIELD.trailLandAlpha);g.lineStyle(2,color,1);}
   else{this.hex(g,id,color,FIELD.trailAlpha);g.lineStyle(1.5,color,FIELD.trailLineAlpha);}
   this.strokeHex(g,id);}
 }
 private strokeHex(g:Phaser.GameObjects.Graphics,id:number):void {const origin=g.getData('origin') as Vec|undefined;g.strokePoints(origin?this.map!.cells[id].vertices.map(v=>({x:v.x-origin.x,y:v.y-origin.y})):this.map!.cells[id].vertices,true);}
 private chunkKey(id:number):string {return this.cellChunkKeys[id];}
 private drawView(view:MatchView,reset=false,previous?:MatchView):void {
  const colorsChanged=this.syncCosmetics(view);
  if(!this.map||this.map.mapId!==view.mapId){
   const initAt=performance.now();
   this.map=createMap(view.config.mapRadius,view.config.hexSideWorldUnits,view.config.mapShape??0);
   for(const g of this.groundChunks.values())g.destroy();this.groundChunks.clear();for(const part of [...this.boundaryParts,...this.boardParts])for(const g of part.graphics)g.destroy();this.boundaryParts=[];this.boardParts=[];this.boundaryCells=[];this.boardKey='';
   if(this.groundKey)this.textures.remove(this.groundKey);
   for(const g of this.chunks.values())g.destroy();this.chunks.clear();
   for(const g of this.landChunks.values())g.destroy();this.landChunks.clear();for(const g of this.trailTops.values())g.destroy();this.trailTops.clear();
   if(this.landKey)this.textures.remove(this.landKey);this.landKey='';this.landAtlasKey='';
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
    this.landChunks.set(key,this.add.blitter(0,0,'__DEFAULT').setDepth(1.001));this.trailTops.set(key,this.add.graphics().setDepth(1.002));
   }
   // The map edge line over the ground, split like the board so only nearby pieces draw.
   const edgeGroups=new Map<string,MapDefinition['boundaryEdges']>();
   for(const e of this.map.boundaryEdges){const key=this.edgeChunkKey([e.a,e.b]);edgeGroups.set(key,[...(edgeGroups.get(key)??[]),e]);}
   for(const own of edgeGroups.values()){const g=this.add.graphics().setDepth(0).lineStyle(3,FIELD.edgeLine,1);for(const e of own)g.lineBetween(e.a.x,e.a.y,e.b.x,e.b.y);
    this.boundaryParts.push({graphics:[g],...bounds(own.flatMap(e=>[e.a,e.b]),4)});}
   this.metrics.groundPreparationMs=performance.now()-groundAt;
   for(const cp of this.map.controlPoints){const c=this.map.cells[cp.cellId];this.points.push(this.add.text(c.center.x,c.center.y,'◆ '+(cp.pointId+1),{fontFamily:'sans-serif',fontSize:'19px',fontStyle:'bold',color:'#142330',backgroundColor:'#ffce70',padding:{x:9,y:8},resolution:this.pixelRatio}).setOrigin(0.5).setDepth(4));}
   this.lastOwners=new Uint8Array(this.map.cells.length).fill(255);this.lastTrails=new Uint16Array(this.map.cells.length);
   this.miniLayer=undefined;this.miniPaths=[];this.miniOwners=new Uint8Array();this.lastMini=-Infinity;
   this.metrics.minimapPreparationMs=0;
   this.metrics.mapInitMs=performance.now()-initAt;
  }
  const redrawAt=performance.now();
  const atlasChanged=this.ensureLandAtlas();
  // Land tiles change only with ownership; trails change every move. Rebuilding a chunk's land for a
  // trail step would redo hundreds of tiles per snapshot, so the two are tracked separately.
  const landDirty=new Set<string>(),trailDirty=new Set<string>();
  if(colorsChanged||reset||atlasChanged)for(const key of this.chunkIndex.keys()){landDirty.add(key);trailDirty.add(key);}
  for(let id=0;id<view.owners.length;id++){
   if(this.lastTrails[id]!==view.trailMasks[id])trailDirty.add(this.chunkKey(id));
   if(this.lastOwners[id]===view.owners[id])continue;landDirty.add(this.chunkKey(id));
   // A trail is drawn under or over land depending on the cell's owner.
   trailDirty.add(this.chunkKey(id));
   // The two cells above draw their tile side over this cell only while it is
   // empty, so they must be redrawn too even when they sit in another chunk.
   for(const n of [1,2]){const above=this.map.cells[id].neighbors[n];if(above>=0)landDirty.add(this.chunkKey(above));}
  }
  for(const key of landDirty){
   const cells=this.chunkIndex.get(key)!.cells;
   // Same per-cell order as the former Graphics: the lower sides that face open ground, then the top.
   const land=this.landChunks.get(key)!,{minX,minY}=this.landBox;land.clear();
   for(const id of cells){const owner=view.owners[id];if(!owner)continue;const c:MapDefinition['cells'][number]=this.map.cells[id],x=c.center.x+minX,y=c.center.y+minY;
    for(const [n,face]of [[5,'se'],[4,'sw']] as const){const next=c.neighbors[n];if(next<0||!view.owners[next])land.create(x,y,face+(owner-1));}
    land.create(x,y,'top'+(owner-1));
   }
  }
  for(const key of trailDirty){
   const g=this.chunks.get(key)!;g.clear();
   const cells=this.chunkIndex.get(key)!.cells;
   // Trails on open ground go under raised land so neighbouring tile sides overlap them.
   for(const id of cells)if(view.trailMasks[id]&&!view.owners[id])this.trail(g,id,view.trailMasks[id],view.config.maxSlots,false);
   // A trail crossing someone's land must stay visible on top of that land.
   const top=this.trailTops.get(key)!;top.clear();
   for(const id of cells)if(view.trailMasks[id]&&view.owners[id])this.trail(top,id,view.trailMasks[id],view.config.maxSlots,true);
  }
  this.territoryEffects?.accept(view,this.lastOwners,this.cellChunkKeys,this.renderColors,performance.now(),reset,previous);
  this.captureEffects?.accept(view,this.lastOwners,this.cellChunkKeys,this.renderColors,performance.now(),reset,previous,view.participants.find(p=>p.participantId===this.selfId)?.slot??-1);this.themeCaptures();
  this.lastOwners.set(view.owners);this.lastTrails.set(view.trailMasks);
  this.metrics.territoryRedrawMs=performance.now()-redrawAt;
  const present=new Set(view.participants.map(p=>p.participantId));
  for(const [id,avatar]of this.avatars)if(!present.has(id)){avatar.container.destroy();this.avatars.delete(id);this.trails?.forget(id);}
  for(const p of view.participants){
   let avatar=this.avatars.get(p.participantId);
   if(!avatar){
    const shield=this.add.circle(0,0,44,0x101b29,0).setStrokeStyle(3,this.renderColors[p.slot],0.9);
    const marker=new PlayerMarker(this);
    const self=p.participantId===this.selfId,label=this.add.text(0,-54,p.nickname,{fontFamily:'Jua, Gothic A1, sans-serif',fontSize:self?'14px':'12px',color:'#ffffff',backgroundColor:self?'#1f1b2d':'#1f1b2d8c',padding:{x:7,y:3},resolution:this.pixelRatio}).setOrigin(0.5);
    const container=this.add.container(p.position.x,p.position.y,[shield,marker.container,label]).setDepth(5);
    avatar={container,marker,shield,label,life:p.lifeId,territory:p.territoryCount,alive:p.lifeState==='ALIVE'};this.avatars.set(p.participantId,avatar);
   }
   const appearance=p.kind==='BOT'?{markerId:this.botMarkerIds[p.slot%this.botMarkerIds.length]??'default',markerColorId:'slot'}:this.markerAppearance;
   avatar.marker.set(appearance,this.renderColors[p.slot],p.participantId===this.selfId,p.kind==='BOT');
   // Any gain within one life is a capture; the marker hops once.
   if(avatar.life===p.lifeId&&p.territoryCount>avatar.territory&&!reset)avatar.marker.jump(performance.now());avatar.life=p.lifeId;avatar.territory=p.territoryCount;
   avatar.shield.setStrokeStyle(3,this.renderColors[p.slot],.9);
   avatar.alive=p.lifeState==='ALIVE';avatar.container.setVisible(avatar.alive);
   avatar.label.setText(p.nickname);
   avatar.label.setScale(Math.max(1,.7/gameplayZoom(this.viewportWidth)));
   // Positions are applied only in the render update, keeping camera and avatar on one frame.
   avatar.shield.setVisible(p.protected);
   if(p.participantId===(this.botDebugFollowId??this.selfId)){
    // startFollow recenters immediately; restarting it for every snapshot causes camera shake.
    if(this.followTarget!==avatar.container){this.followTarget=avatar.container;this.cameras.main.startFollow(avatar.container,false,1,1);}
   }
  }
  for(const [i,cp]of this.map.controlPoints.entries()){const owner=view.owners[cp.cellId];this.points[i].setVisible(GAME_MODES[view.gameMode.id].usesControlPoints).setBackgroundColor(owner?cssColor(this.renderColors[owner-1]):'#ffce70');}
  if(!this.selfId&&!this.botDebugFollowId){this.followTarget=null;this.cameras.main.stopFollow();this.cameras.main.centerOn(0,0);}
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
  let span=perfNow();this.combat?.update(now);perfAdd('step.fx.combat',span);
  span=perfNow();this.territoryEffects?.update(now,this.view,this.cullChunks);perfAdd('step.fx.territory',span);
  span=perfNow();this.captureEffects?.update(now,this.view,this.cullChunks);perfAdd('step.fx.capture',span);
  span=perfNow();
  const viewRect=this.cameras.main.worldView,avatarMargin=cullMargin(this.map);
  for(const [id,avatar]of this.avatars){
   const position=this.presentation.position(id,now);if(position)avatar.container.setPosition(position.x,position.y);
   // Include the entire name label, shield, hop and pulse, plus the existing movement margin.
   // The followed avatar stays visible while its camera recenters. Offscreen animation uses absolute
   // time, so returning markers immediately have the same pose and effects as continuous updates.
   const padX=avatarMargin+Math.max(80,avatar.label.displayWidth/2),padY=avatarMargin+80;
   const {x,y}=avatar.container,followed=id===(this.botDebugFollowId??this.selfId);
   const visible=avatar.alive&&(!this.cullChunks||followed||(x+padX>=viewRect.x&&x-padX<=viewRect.right&&y+padY>=viewRect.y&&y-padY<=viewRect.bottom));
   avatar.container.setVisible(visible);if(visible){avatar.marker.update(now);this.trails?.follow(id,avatar.marker.markerId,x,y,followed,now);}
  }
  this.trails?.update(now);
  perfAdd('step.markers',span);span=perfNow();
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
  perfAdd('step.wall',span);span=perfNow();
  const camera=this.cameras.main,margin=cullMargin(this.map);
  // camera.worldView is the last completed frame; the margin covers movement
  // before the next camera pre-render (see cullMargin).
  const rect=camera.worldView;
  for(const [key,chunk]of this.chunkIndex){const visible=!this.cullChunks||(chunk.maxX>=rect.x-margin&&chunk.minX<=rect.right+margin&&chunk.maxY>=rect.y-margin&&chunk.minY<=rect.bottom+margin);
   this.groundChunks.get(key)!.setVisible(visible);this.chunks.get(key)!.setVisible(visible);this.landChunks.get(key)!.setVisible(visible);this.trailTops.get(key)!.setVisible(visible);
  }
  for(const part of [...this.boardParts,...this.boundaryParts]){const visible=!this.cullChunks||(part.maxX>=rect.x-margin&&part.minX<=rect.right+margin&&part.maxY>=rect.y-margin&&part.minY<=rect.bottom+margin);for(const g of part.graphics)g.setVisible(visible);}
  perfAdd('step.cull',span);span=perfNow();
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
  perfAdd('step.predict',span);
  if(time-this.lastMini<250)return;this.lastMini=time;
  span=perfNow();this.updateMinimap(now);perfAdd('step.minimap',span);
 }
 private updateMinimap(now:number):void {
  if(!this.map||!this.view)return;
  const canvas=document.querySelector<HTMLCanvasElement>('#minimap');if(!canvas||canvas.hidden)return;
  const context=canvas.getContext('2d');if(!context)return;
  const miniAt=performance.now();
  const width=240,height=204,backingWidth=Math.max(width,Math.round(canvas.clientWidth*this.pixelRatio)),backingHeight=Math.max(height,Math.round(canvas.clientHeight*this.pixelRatio));
  if(backingWidth<1||backingHeight<1)return;
  if(canvas.width!==backingWidth||canvas.height!==backingHeight){canvas.width=backingWidth;canvas.height=backingHeight;}
  context.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
  const span=this.mapSpan(),scale=Math.min((width-20)/span.width,(height-20)/span.height);
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
 // Board pieces are grouped by render chunk so only those near the camera are drawn (performance PRD:
 // Graphics are re-triangulated every frame). One depth per pass keeps the single-Graphics layering:
 // every side under every edge line under every rim.
 private drawBoard():void {
  const map=this.map!,geometry=this.wallMargin?boundaryGeometry(map):null,edges=geometry?.edges??map.boundaryEdges,t=map.side*FIELD.boardThickness;
  for(const part of this.boardParts)for(const g of part.graphics)g.destroy();this.boardParts=[];
  const groups=new Map<string,{edges:typeof edges;polys:Vec[][]}>(),group=(points:Vec[])=>{const key=this.edgeChunkKey(points);let g=groups.get(key);if(!g){g={edges:[],polys:[]};groups.set(key,g);}return g;};
  for(const e of edges)group([e.a,e.b]).edges.push(e);
  for(const poly of geometry?.polygons??[])group(poly).polys.push(poly);
  for(const {edges:own,polys}of groups.values()){
   const side=this.add.graphics().setDepth(-.12).fillStyle(FIELD.boardSide,1),line=this.add.graphics().setDepth(-.11).lineStyle(12,FIELD.boardEdge,1),rim=this.add.graphics().setDepth(-.1).fillStyle(FIELD.rim,1);
   for(const e of own){side.fillPoints([e.a,e.b,{x:e.b.x,y:e.b.y+t},{x:e.a.x,y:e.a.y+t}],true);line.lineBetween(e.a.x,e.a.y,e.b.x,e.b.y);}
   for(const poly of polys)rim.fillPoints(poly,true);
   this.boardParts.push({graphics:[side,line,rim],...bounds([...own.flatMap(e=>[e.a,e.b,{x:e.a.x,y:e.a.y+t},{x:e.b.x,y:e.b.y+t}]),...polys.flat()],8)});
  }
 }
 private boundaryCells:number[]=[];
 /**
  * Render chunk for a board piece near the points' centre. Any nearby chunk is fine: each piece is culled
  * by its own bounds. Pulling the centre one cell toward the middle lands in an edge cell almost always;
  * otherwise the nearest boundary cell is searched.
  */
 private edgeChunkKey(points:Vec[]):string {
  const map=this.map!,x=points.reduce((n,p)=>n+p.x,0)/points.length,y=points.reduce((n,p)=>n+p.y,0)/points.length;
  const length=Math.hypot(x,y),inward=length>0?Math.max(0,length-Math.sqrt(3)*map.side)/length:0,cell=worldCell(map,{x:x*inward,y:y*inward});
  if(cell>=0)return this.cellChunkKeys[cell];
  if(!this.boundaryCells.length)this.boundaryCells=map.cells.filter(c=>c.neighbors.includes(-1)).map(c=>c.id);
  let best=this.boundaryCells[0],distance=Infinity;
  for(const id of this.boundaryCells){const c=map.cells[id].center,d=(c.x-x)**2+(c.y-y)**2;if(d<distance){distance=d;best=id;}}
  return this.cellChunkKeys[best];
 }
 private span:{width:number;height:number;mapId:string}|null=null;
 /** Symmetric world extent of the board (all shapes are centred on the origin). */
 private mapSpan():{width:number;height:number}{
  if(this.span?.mapId!==this.map!.mapId){let x=0,y=0;for(const c of this.map!.cells)for(const v of c.vertices){x=Math.max(x,Math.abs(v.x));y=Math.max(y,Math.abs(v.y));}this.span={width:2*x,height:2*y,mapId:this.map!.mapId};}
  return this.span!;
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
  const self=this.view?.participants.find(p=>p.participantId===(this.botDebugFollowId??this.selfId)),avatar=self&&this.avatars.get(self.participantId)?.container,camera=this.cameras.main;
  return {renderedAt:this.renderedAt,camera:{x:camera.scrollX,y:camera.scrollY},zoom:camera.zoom/this.pixelRatio,pixelRatio:this.pixelRatio,backing:{width:this.game.canvas.width,height:this.game.canvas.height},viewport:{width:this.viewportWidth,height:this.viewportHeight},centerError:avatar?Math.hypot(avatar.x-camera.midPoint.x,avatar.y-camera.midPoint.y):0,tick:this.view?.tick??0,lifeId:self?.lifeId??null,lifeState:self?.lifeState??null};
 }
 destroyGame():void {this.game.destroy(true);}
}
export function createRenderer(parent:string):GameScene {
 const scene=new GameScene();
 const game=new Phaser.Game({type:Phaser.AUTO,parent,backgroundColor:FIELD.table,width:window.innerWidth,height:window.innerHeight,
  scale:{mode:Phaser.Scale.NONE,autoCenter:Phaser.Scale.NO_CENTER},
  scene:[scene],render:{antialias:true,powerPreference:'high-performance'},banner:false,audio:{noAudio:true}});
 // Measurement builds can lift the cap (?perfFps=0) for A/B comparisons.
 const fpsParam=PERF_BUILD?new URLSearchParams(location.search).get('perfFps'):null;
 scene.liveFps=fpsParam!==null?Number(fpsParam):60;const idleParam=PERF_BUILD?new URLSearchParams(location.search).get('perfIdleFps'):null;if(idleParam!==null)scene.idleFps=Number(idleParam);scene.frameLimit=installFrameLimit(game,scene.liveFps);
 game.events.on(Phaser.Core.Events.POST_RENDER,()=>scene.afterRender());
 startFrameMeter(game,()=>scene.renderState());
 return scene;
}





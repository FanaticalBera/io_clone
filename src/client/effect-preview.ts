// Shop preview of a premium marker's effects on a small board, drawn by the same code as play:
// capture themes and particles (capture), and the combat burst fed with a staged death (kill, death).
// A scene plays once when asked, then the board sleeps; nothing loops on screen.
import Phaser from 'phaser';
import {PlayerMarker} from './player-marker.js';
import {MarkerTrails} from './marker-trails.js';
import {CombatEffects,type KillStyle} from './combat-effects.js';
import {CAPTURE_THEMES,themePalette,themedTile,themedEdge,themedEdgeColors,themedRing,themedDelay,tileSpot} from './capture-themes.js';
import {markerDefinition} from './catalog.js';
import {disk,axialToWorld} from '../shared/hex.js';
import type {MatchView} from '../shared/model.js';
export type PreviewScene='capture'|'kill'|'death';
/** Which scenes a marker has: every premium marker captures; gold ones also theme kills and deaths. */
export function previewScenes(markerId:string):PreviewScene[]{
 if(!CAPTURE_THEMES[markerId])return [];return markerDefinition(markerId)?.legendary?['capture','kill','death']:['capture'];
}
// One lap of the track takes LAP ms (about game speed).
const SIDE=22,RING=2,WAVE=250,POP=200,LAP=1700,RX=82,RY=62,INK=0x1f1b2d,FIELD=0xeef1f6,VICTIM=0xff8a3d;
/** When each scene's moment happens and when it is over, in ms from its start. */
const TIMING:Record<PreviewScene,{fire:number;end:number}>={capture:{fire:LAP,end:LAP+1250},kill:{fire:LAP*.55,end:LAP*.55+950},death:{fire:LAP*.4,end:LAP*.4+1050}};
const corner=(x:number,y:number,i:number)=>{const a=Math.PI/180*(60*i-30);return {x:x+Math.cos(a)*SIDE,y:y+Math.sin(a)*SIDE};};
const AXIALS=disk({q:0,r:0},RING),CENTERS=AXIALS.map(a=>axialToWorld(a.q,a.r,SIDE));
const PATCH=AXIALS.map((a,n)=>{const p=CENTERS[n],ring=Math.max(Math.abs(a.q),Math.abs(a.r),Math.abs(a.q+a.r));
 const outside=[0,1,2,3,4,5].filter(i=>{const v=corner(p.x,p.y,i),w=corner(p.x,p.y,(i+1)%6);return !CENTERS.some(c=>Math.hypot(c.x-(v.x+w.x-p.x),c.y-(v.y+w.y-p.y))<1);});
 return {...p,ring,outside};});
// The board around the patch: a few rings of plain field tiles.
const FIELD_TILES=disk({q:0,r:0},5).map(a=>axialToWorld(a.q,a.r,SIDE));
class PreviewBoard extends Phaser.Scene {
 markerId='';land=0x4ea8ff;body=0x4ea8ff;mode:PreviewScene='capture';onDone:()=>void=()=>{};
 private marker!:PlayerMarker;private victim!:PlayerMarker;private trails!:MarkerTrails;private combat!:CombatEffects;
 private field!:Phaser.GameObjects.Graphics;private patch!:Phaser.GameObjects.Graphics;private rings!:Phaser.GameObjects.Graphics;private path!:Phaser.GameObjects.Graphics;
 private started=0;private fired=false;private done=true;private event=0;
 constructor(){super('preview');}
 create():void{
  this.cameras.main.setBackgroundColor(FIELD);
  this.field=this.add.graphics().setDepth(0);this.path=this.add.graphics().setDepth(1);this.patch=this.add.graphics().setDepth(2);this.rings=this.add.graphics().setDepth(6);
  this.trails=new MarkerTrails(this);
  this.marker=new PlayerMarker(this);this.marker.container.setDepth(5);
  this.victim=new PlayerMarker(this);this.victim.container.setDepth(5);
  this.combat=new CombatEffects(this,[this.body,VICTIM],()=>{},()=>{},id=>{const s=(id==='me'?this.marker:this.victim).state();return s?.textureReady?s.textureKey:null;});
  this.combat.killStyle=id=>id==='me'?this.style():null;
  this.combat.feedbackEnabled=false;
  this.combat.themedKill=(_id,p)=>this.trails.kill(this.markerId,p.x,p.y);
  for(const c of FIELD_TILES){const pts=Array.from({length:6},(_,i)=>corner(c.x,c.y,i));this.field.fillStyle(0xffffff,1).lineStyle(1.5,0xd8dcef,1).fillPoints(pts,true).strokePoints(pts,true);}
  this.scale.on('resize',()=>this.fit());this.fit();
 }
 private style():KillStyle|null{const theme=CAPTURE_THEMES[this.markerId];return theme&&markerDefinition(this.markerId)?.legendary?{theme,palette:themePalette(theme)}:null;}
 private fit():void{const w=this.scale.width,h=this.scale.height;this.cameras.main.setZoom(Math.min(w/250,h/190)).centerOn(0,0);this.combat?.setViewport(w,h,1);}
 /** Starts the current scene from the beginning; onDone runs once when it is over. */
 play():void{
  this.marker.set({markerId:this.markerId,markerColorId:'slot'},this.body,false,true);
  this.victim.set({markerId:'default',markerColorId:'slot'},VICTIM,false,true);
  this.combat.accept(this.view([]),null,true);this.trails.forget('me');
  this.started=performance.now();this.fired=false;this.done=false;
 }
 private view(events:MatchView['events']):MatchView{
  return {matchId:'shop-preview',tick:this.event,config:{simulationHz:30},events,participants:[{participantId:'me',slot:0,nickname:'나',position:{x:0,y:0}},{participantId:'victim',slot:1,nickname:'상대',position:{x:0,y:0}}]} as unknown as MatchView;
 }
 private die(participantId:string,killerId:string|undefined,x:number,y:number):void{
  this.event++;
  this.combat.accept(this.view([{eventId:'e'+this.event,type:'DEATH',tick:this.event,participantId,lifeId:1,reason:killerId?'TRAIL_CONTACT':'WALL_HIT',position:{x,y},...(killerId?{killerId}:{})} as unknown as MatchView['events'][number]]),killerId?'me':null);
 }
 /** A point on the running track around the patch, f laps from the top. */
 private track(f:number):{x:number;y:number}{const a=-Math.PI/2+f*Math.PI*2;return {x:Math.cos(a)*RX,y:Math.sin(a)*RY};}
 update():void{
  if(this.done)return;
  const now=performance.now(),elapsed=now-this.started,{fire,end}=TIMING[this.mode],me=this.track(elapsed/LAP);
  this.patch.clear();this.rings.clear();this.path.clear();
  const theme=CAPTURE_THEMES[this.markerId];let visible=true;
  if(this.mode==='capture'){
   // One lap draws a loop around the patch; closing it captures, and the marker runs on while it plays.
   const origin=this.track(0),since=elapsed-fire;
   if(since<0){const f=elapsed/LAP,pts=Array.from({length:Math.max(2,Math.ceil(f*48)+1)},(_,i)=>this.track(Math.min(f,i/48)));this.path.lineStyle(12,this.land,.45).strokePoints(pts,false);}
   else if(!this.fired){this.fired=true;this.marker.jump(now);
    if(theme?.particles)this.trails.capture(this.markerId,origin,PATCH.map(p=>({x:p.x,y:p.y,delay:p.ring/RING*WAVE})),true,now);}
   if(since>=0){const fade=since>end-fire-300?(end-fire-since)/300:1;
    for(const p of PATCH){
     const pts=Array.from({length:6},(_,i)=>corner(p.x,p.y,i)),spot=tileSpot(p.x,p.y,origin,p.ring/RING,RING*SIDE*1.8);
     const delay=theme?themedDelay(theme,spot,WAVE):p.ring/RING*WAVE,local=since-delay;
     this.patch.fillStyle(local>=0?this.land:0xcfe3ff,fade).fillPoints(pts,true);
     const tile=theme?themedTile(theme,spot,local,this.land):null;
     if(tile){const pop=local<POP?1+(tile.pop??.16)*Math.sin(local/POP*Math.PI):1,big=pts.map(v=>({x:p.x+(v.x-p.x)*pop,y:p.y+(v.y-p.y)*pop}));this.patch.fillStyle(tile.color,tile.alpha).fillPoints(big,true).lineStyle(2,INK,.45*tile.alpha).strokePoints(big,true);}
     if(theme)for(const i of p.outside){const v=pts[i],w=pts[(i+1)%6],angle=Math.atan2((v.y+w.y)/2-origin.y,(v.x+w.x)/2-origin.x),light=themedEdge(theme,angle,since);
      if(light>0){const c=themedEdgeColors(theme,angle,this.land);this.patch.lineStyle(5+4*light,c.line,.95*light).lineBetween(v.x,v.y,w.x,w.y).lineStyle(2.5,c.core,light).lineBetween(v.x,v.y,w.x,w.y);}}
    }
    const ring=theme?themedRing(theme,since):null;
    if(theme&&ring)this.rings.lineStyle(7,INK,.5*ring.alpha).strokeCircle(origin.x,origin.y,ring.radius).lineStyle(4,theme.ring,ring.alpha).strokeCircle(origin.x,origin.y,ring.radius);}
   this.victim.container.setVisible(false);
  }else if(this.mode==='kill'){
   // Another piece waits on the track; the marker runs through it and keeps going.
   const spot=this.track(fire/LAP);
   this.victim.container.setPosition(spot.x,spot.y).setVisible(elapsed<fire).setAlpha(Math.min(1,elapsed/200));
   if(elapsed>=fire&&!this.fired){this.fired=true;this.die('victim','me',spot.x,spot.y);}
  }else{
   // The marker falls mid-run.
   visible=elapsed<fire;
   if(elapsed>=fire&&!this.fired){this.fired=true;this.die('me',undefined,me.x,me.y);}
   this.victim.container.setVisible(false);
  }
  this.marker.container.setPosition(me.x,me.y).setVisible(visible);
  if(visible)this.trails.follow('me',this.markerId,me.x,me.y,true,now);
  this.marker.update(now);this.victim.update(now);this.trails.update(now);this.combat.update(now);
  if(elapsed>=end){this.done=true;this.onDone();}
 }
}
/**
 * One small Phaser board for the shop. play() wakes it, runs one scene and calls back when it
 * is over; the board then sleeps until the next play, and is destroyed when the shop closes.
 */
export class EffectPreview {
 private game:Phaser.Game|null=null;private host:HTMLElement|null=null;private ticket=0;
 play(host:HTMLElement,markerId:string,land:number,body:number,mode:PreviewScene,onDone:()=>void):void{
  const ticket=++this.ticket;
  if(this.game&&this.host!==host)this.hide();
  const start=()=>{
   const scene=this.game?.scene.getScene('preview') as PreviewBoard|undefined;if(!scene||ticket!==this.ticket)return;
   if(!scene.sys.isActive()){scene.events.once(Phaser.Scenes.Events.CREATE,start);return;}
   Object.assign(scene,{markerId,land,body,mode,onDone:()=>{if(ticket!==this.ticket)return;onDone();window.setTimeout(()=>{if(ticket===this.ticket)this.game?.loop.sleep();},400);}});
   this.game!.loop.wake();scene.play();
  };
  if(!this.game){this.host=host;
   // A small board: 30 fps and at most 2x resolution are plenty, and keep the shop light.
   this.game=new Phaser.Game({type:Phaser.AUTO,parent:host,backgroundColor:'#eef1f6',scale:{mode:Phaser.Scale.RESIZE,width:'100%',height:'100%'},resolution:Math.min(2,window.devicePixelRatio),fps:{target:30,limit:30},banner:false,scene:PreviewBoard} as Phaser.Types.Core.GameConfig);
   this.game.events.once(Phaser.Core.Events.READY,start);}
  else start();
 }
 /** Stops whatever is playing without a callback. */
 stop():void{this.ticket++;this.game?.loop.sleep();}
 hide():void{this.ticket++;this.game?.destroy(true);this.game=null;this.host=null;}
}

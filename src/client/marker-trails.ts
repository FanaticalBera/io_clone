import Phaser from 'phaser';
import {markerDefinition} from './catalog.js';
import {CAPTURE_THEMES} from './capture-themes.js';
/**
 * Premium marker effects. Every special and legendary marker has a themed
 * capture: a burst at the marker and its particles blooming over the newly
 * captured tiles as the flip wave passes. Legendary (gold) markers also keep a
 * soft movement trail. One shared emitter per layer serves every player
 * wearing that marker; nothing is emitted for off-screen or still markers.
 */
const INK=0x1f1b2d,TEX=32;
type Shape='dot'|'star'|'flame'|'petal'|'heart'|'flake'|'ring'|'hex'|'bolt'|'glow'|'bubble';
type EmitterConfig=Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
/** fire: baked three-tone flame (outer, middle, core) that flares up then dies down; not tinted. */
interface Layer {shape:Shape;count?:number;config:EmitterConfig;fire?:readonly [number,number,number]}
export interface TrailStyle {step:number;layers:Layer[]}
const tint=(...colors:number[])=>({tint:colors});
const fade={alpha:{start:1,end:0}};
const SPECIAL=24,LEGEND=18;
const EMBER=[0xff7a1a,0xffb020,0xfff1a8] as const,PHOENIX=[0xe8453c,0xff8a1a,0xffe066] as const,GOLD_FIRE=[0xffa000,0xffd23f,0xfffbe0] as const;
// Scales below are tuned at texture size; this lifts them all to read at gameplay zoom.
const SIZE=1.8;
export const TRAIL_STYLES:Readonly<Record<string,TrailStyle>>={
 // Special: one light layer.
 orbit:{step:SPECIAL,layers:[{shape:'dot',count:2,config:{lifespan:600,speed:{min:8,max:24},scale:{start:.42,end:0},...tint(0xffc93c,0xffe28a)}}]},
 crown:{step:SPECIAL,layers:[{shape:'star',count:2,config:{lifespan:620,speed:{min:6,max:20},rotate:{min:-40,max:40},scale:{start:.5,end:0},...tint(0xffc93c,0xfff6e0)}}]},
 ember:{step:20,layers:[
  {shape:'flame',fire:EMBER,count:2,config:{lifespan:640,speedX:{min:-10,max:10},speedY:{min:-40,max:-16},rotate:{min:-14,max:14},scale:{start:.8,end:0}}},
  {shape:'dot',config:{lifespan:560,speedX:{min:-30,max:30},speedY:{min:-110,max:-60},scale:{start:.2,end:0},...tint(0xffe066,0xffb020)}}]},
 meteor:{step:SPECIAL,layers:[{shape:'star',count:2,config:{lifespan:460,speed:{min:40,max:90},rotate:{min:0,max:360},scale:{start:.42,end:0},...tint(0xfff6e0,0xffe066,0x9fd8ff)}}]},
 portal:{step:SPECIAL,layers:[{shape:'ring',config:{lifespan:600,scale:{start:.2,end:.75},...fade,...tint(0xb48cff,0x7c5cff)}}]},
 sun:{step:SPECIAL,layers:[{shape:'dot',count:2,config:{lifespan:480,speed:{min:20,max:46},scale:{start:.4,end:0},...tint(0xffd23f,0xff9f1c)}}]},
 heart:{step:SPECIAL,layers:[{shape:'heart',config:{lifespan:700,speed:{min:4,max:12},gravityY:-45,scale:{start:.5,end:.22},...fade,...tint(0xff6b9a,0xff9cc0)}}]},
 storm:{step:SPECIAL,layers:[{shape:'bolt',count:2,config:{lifespan:440,speed:{min:24,max:56},rotate:{min:-30,max:30},scale:{start:.55,end:.1},...tint(0x8fe3ff,0xffe066)}}]},
 // Legendary: denser trails with a second layer.
 phoenix:{step:LEGEND,layers:[
  {shape:'flame',fire:PHOENIX,config:{lifespan:720,speedX:{min:-12,max:12},speedY:{min:-50,max:-20},rotate:{min:-16,max:16},scale:{start:.85,end:0}}},
  {shape:'star',config:{lifespan:520,speed:{min:50,max:100},rotate:{min:0,max:360},scale:{start:.32,end:0},...tint(0xffb347,0xffe066)}}]},
 blackhole:{step:LEGEND,layers:[
  {shape:'ring',config:{lifespan:700,scale:{start:.15,end:.95},alpha:{start:.9,end:0},...tint(0x6b3fd1,0x2a1650)}},
  {shape:'dot',config:{lifespan:520,speed:{min:14,max:30},scale:{start:.32,end:0},...tint(0xb48cff,0x2a1650)}}]},
 rainbow:{step:14,layers:[{shape:'dot',config:{lifespan:640,speed:{min:2,max:8},scale:{start:.55,end:.15},...fade,...tint(0xff5a5a,0xff9f1c,0xffd23f,0x46c46a,0x4ea8ff,0x9b6bff)}}]},
 snowflake:{step:LEGEND,layers:[
  {shape:'flake',config:{lifespan:950,speedY:{min:8,max:26},speedX:{min:-14,max:14},rotate:{start:0,end:180},scale:{start:.55,end:.2},...fade,...tint(0xe8f7ff,0xa8dcff)}},
  {shape:'dot',config:{lifespan:500,speed:{min:10,max:30},scale:{start:.22,end:0},...tint(0xffffff,0xbfe9ff)}}]},
 sakura:{step:LEGEND,layers:[{shape:'petal',config:{lifespan:1050,speed:{min:16,max:44},gravityY:24,rotate:{min:0,max:360},scale:{start:.6,end:.3},...fade,...tint(0xffc2d9,0xff8fb8,0xfff0f5)}}]},
 kingslime:{step:LEGEND,layers:[
  {shape:'dot',config:{lifespan:620,speed:{min:16,max:40},angle:{min:200,max:340},gravityY:170,scale:{start:.58,end:.22},...tint(0x7ee081,0x46c46a)}},
  {shape:'bubble',config:{lifespan:700,scale:{start:.2,end:.5},...fade,...tint(0xb8f5b0)}}]},
 diamond:{step:LEGEND,layers:[
  {shape:'star',count:2,config:{lifespan:560,speed:{min:20,max:56},rotate:{min:0,max:90},scale:{start:.55,end:0},...tint(0xffffff,0xbff3ff,0x9be7ff)}},
  {shape:'glow',config:{lifespan:420,scale:{start:.9,end:.3},alpha:{start:.45,end:0},...tint(0xbff3ff)}}]},
 golddragon:{step:LEGEND,layers:[
  {shape:'petal',config:{lifespan:760,speed:{min:20,max:46},rotate:{min:0,max:360},scale:{start:.5,end:.2},...fade,...tint(0xffd23f,0xffb000,0xfff2a8)}},
  {shape:'flame',fire:GOLD_FIRE,config:{lifespan:600,speedX:{min:-10,max:10},speedY:{min:-40,max:-16},rotate:{min:-14,max:14},scale:{start:.8,end:0}}},
  {shape:'glow',config:{lifespan:420,scale:{start:1,end:.3},alpha:{start:.4,end:0},...tint(0xffd23f)}}]},
 // Completion rewards: legendary weight, one signature each.
 goldpuck:{step:LEGEND,layers:[{shape:'star',count:2,config:{lifespan:560,speed:{min:20,max:56},rotate:{min:0,max:90},scale:{start:.5,end:0},...tint(0xffd23f,0xfff2a8)}},{shape:'glow',config:{lifespan:420,scale:{start:.9,end:.3},alpha:{start:.4,end:0},...tint(0xffd23f)}}]},
 crowncat:{step:LEGEND,layers:[{shape:'heart',config:{lifespan:720,speed:{min:6,max:16},gravityY:-50,scale:{start:.45,end:.2},...fade,...tint(0xff9cc0,0xffd23f)}},{shape:'star',config:{lifespan:520,speed:{min:30,max:70},scale:{start:.4,end:0},...tint(0xffd23f)}}]},
 archmage:{step:LEGEND,layers:[{shape:'star',count:2,config:{lifespan:640,speed:{min:16,max:44},rotate:{min:0,max:180},scale:{start:.48,end:0},...tint(0xb48cff,0x7fd3ff,0xfff6e0)}},{shape:'ring',config:{lifespan:560,scale:{start:.15,end:.7},alpha:{start:.8,end:0},...tint(0xb48cff)}}]},
 goldbot:{step:LEGEND,layers:[{shape:'bolt',count:2,config:{lifespan:340,speed:{min:40,max:80},rotate:{min:-30,max:30},scale:{start:.55,end:.1},...tint(0xffd23f,0x8fe3ff)}},{shape:'hex',config:{lifespan:600,speed:{min:6,max:16},rotate:{min:0,max:60},scale:{start:.42,end:.1},...fade,...tint(0xffd23f,0xffb000)}}]},
 starwhale:{step:LEGEND,layers:[{shape:'bubble',count:2,config:{lifespan:900,speed:{min:6,max:20},gravityY:-40,scale:{start:.25,end:.55},...fade,...tint(0x9fd8ff,0xd8f0ff)}},{shape:'star',config:{lifespan:560,speed:{min:20,max:50},scale:{start:.38,end:0},...tint(0xfff6e0,0xffe066)}}]},
 hexcrown:{step:LEGEND,layers:[{shape:'hex',count:2,config:{lifespan:700,speed:{min:14,max:36},rotate:{min:0,max:120},scale:{start:.5,end:.1},...fade,...tint(0xffd23f,0xfff2a8,0xffb000)}},{shape:'glow',config:{lifespan:420,scale:{start:1,end:.3},alpha:{start:.4,end:0},...tint(0xffd23f)}}]},
};
export const hasTrail=(markerId:string)=>markerId in TRAIL_STYLES;
/** Markers whose trail is worth showing off, for previews. */
export const TRAIL_MARKER_IDS=Object.keys(TRAIL_STYLES).filter(id=>markerDefinition(id));
function star(g:Phaser.GameObjects.Graphics,c:number,r:number,inner:number,points:number):void{
 const v:Phaser.Types.Math.Vector2Like[]=[];for(let i=0;i<points*2;i++){const a=-Math.PI/2+i*Math.PI/points,d=i%2?inner:r;v.push({x:c+Math.cos(a)*d,y:c+Math.sin(a)*d});}
 g.fillPoints(v,true).strokePoints(v,true);
}
// White fills tint to the layer colour; ink outlines stay ink, matching the marker art.
// A licking flame outline (cubic segments) on a 40x48 canvas, bottom-anchored at (20,46).
const FLAME:readonly number[][]=[[20,46],[8,46,3,36,6,26],[8,20,12,17,12,10],[16,14,17,18,17,21],[19,14,22,8,21,1],[29,9,36,19,35,30],[34,40,28,46,20,46]];
function flamePoints(scale:number):Phaser.Types.Math.Vector2Like[]{
 const at=(x:number,y:number)=>({x:20+(x-20)*scale,y:46+(y-46)*scale}),out=[at(FLAME[0][0],FLAME[0][1])];let [px,py]=FLAME[0];
 for(const [x1,y1,x2,y2,x,y] of FLAME.slice(1)){for(let i=1;i<=8;i++){const t=i/8,u=1-t;out.push(at(u*u*u*px+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x,u*u*u*py+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y));}px=x;py=y;}
 return out;
}
function drawFire(g:Phaser.GameObjects.Graphics,[outer,middle,core]:readonly [number,number,number]):void{
 g.clear().fillStyle(outer,1).lineStyle(2.5,INK,1).fillPoints(flamePoints(1),true).strokePoints(flamePoints(1),true);
 g.fillStyle(middle,1).fillPoints(flamePoints(.66),true).fillStyle(core,1).fillPoints(flamePoints(.34),true);
}
function drawShape(g:Phaser.GameObjects.Graphics,shape:Shape):void{
 const c=TEX/2;g.clear().fillStyle(0xffffff,1).lineStyle(2.5,INK,1);
 if(shape==='dot')g.fillCircle(c,c,9).strokeCircle(c,c,9);
 else if(shape==='star')star(g,c,13,5,4);
 else if(shape==='hex')star(g,c,11,11,3);
 else if(shape==='bolt'){const v=[[19,3],[8,17],[15,17],[11,29],[24,13],[17,13],[21,3]].map(([x,y])=>({x,y}));g.fillPoints(v,true).strokePoints(v,true);}
 else if(shape==='petal'){g.fillEllipse(c,c,13,22).strokeEllipse(c,c,13,22);}
 else if(shape==='heart'){g.fillCircle(c-5,c-3,6.5).fillCircle(c+5,c-3,6.5).fillTriangle(c-11,c-1,c+11,c-1,c,c+11);g.beginPath();g.arc(c-5,c-3,6.5,Math.PI*.8,Math.PI*1.95);g.arc(c+5,c-3,6.5,Math.PI*1.05,Math.PI*.2);g.lineTo(c,c+11);g.closePath();g.strokePath();}
 else if(shape==='flake'){for(const [w,col] of [[6,INK],[3,0xffffff]] as const){g.lineStyle(w,col,1);for(let i=0;i<3;i++){const a=i*Math.PI/3;g.lineBetween(c-Math.cos(a)*12,c-Math.sin(a)*12,c+Math.cos(a)*12,c+Math.sin(a)*12);}}}
 else if(shape==='ring'){g.lineStyle(5,INK,1).strokeCircle(c,c,12).lineStyle(3,0xffffff,1).strokeCircle(c,c,12);}
 else if(shape==='bubble'){g.fillStyle(0xffffff,.35).fillCircle(c,c,11).lineStyle(2.5,INK,1).strokeCircle(c,c,11).fillStyle(0xffffff,1).fillCircle(c-4,c-4,3);}
 else for(let i=8;i>0;i--)g.fillStyle(0xffffff,.16).fillCircle(c,c,i*1.9);
}
interface Follower {x:number;y:number;markerId:string;seen:number}
interface Bloom {at:number;markerId:string;x:number;y:number}
export interface CapturePoint {x:number;y:number;delay:number}
const isLegendary=(markerId:string)=>markerDefinition(markerId)?.legendary===true;
export class MarkerTrails {
 private emitters=new Map<string,Phaser.GameObjects.Particles.ParticleEmitter>();
 private followers=new Map<string,Follower>();private blooms:Bloom[]=[];
 constructor(private scene:Phaser.Scene,private depth=4.5){}
 private texture(shape:Shape):string{
  const key='trail:'+shape;if(this.scene.textures.exists(key))return key;
  const g=this.scene.make.graphics({x:0,y:0},false);drawShape(g,shape);g.generateTexture(key,TEX,TEX);g.destroy();return key;
 }
 private layerTexture(layer:Layer):string{
  if(!layer.fire)return this.texture(layer.shape);
  const key='trail:fire:'+layer.fire.join('-');if(this.scene.textures.exists(key))return key;
  const g=this.scene.make.graphics({x:0,y:0},false);drawFire(g,layer.fire);g.generateTexture(key,40,48);g.destroy();return key;
 }
 /** Scale (and for fire, a flare-up then die-down with a late fade) at SIZE times the tuned values. */
 private sizing(layer:Layer,boost:number):Partial<EmitterConfig>{
  const scale=layer.config.scale as {start:number;end:number};
  if(!layer.fire)return {scale:{start:scale.start*SIZE*boost,end:scale.end*SIZE}};
  const peak=scale.start*SIZE*boost*.75;
  return {scale:{onEmit:()=>0,onUpdate:(_p:unknown,_k:string,t:number)=>peak*Math.sin(Math.PI*Math.pow(t,.55))},
   alpha:{onEmit:()=>1,onUpdate:(_p:unknown,_k:string,t:number)=>t<.6?1:1-(t-.6)/.4},originY:.9} as Partial<EmitterConfig>;
 }
 private emitter(markerId:string,index:number,layer:Layer):Phaser.GameObjects.Particles.ParticleEmitter{
  const key=markerId+':'+index;let emitter=this.emitters.get(key);
  if(!emitter){emitter=this.scene.add.particles(0,0,this.layerTexture(layer),{...layer.config,...this.sizing(layer,1),emitting:false,maxParticles:240}).setDepth(this.depth);this.emitters.set(key,emitter);}
  return emitter;
 }
 /**
  * Call once per frame for each visible marker. Others' trails use a longer
  * step so a crowd of premium markers stays cheap; a jump (respawn) resets.
  */
 follow(id:string,markerId:string,x:number,y:number,local:boolean,now:number):void{
  const style=TRAIL_STYLES[markerId];if(!style||!isLegendary(markerId)){this.followers.delete(id);return;}
  let f=this.followers.get(id);
  if(!f||f.markerId!==markerId||now-f.seen>250||Math.hypot(x-f.x,y-f.y)>400){this.followers.set(id,{x,y,markerId,seen:now});return;}
  // Trails stay soft: the capture is the moment that shows off.
  f.seen=now;const step=style.step*(local?1.6:2.4),dx=x-f.x,dy=y-f.y,distance=Math.hypot(dx,dy);if(distance<step)return;
  const drops=Math.min(3,Math.floor(distance/step));
  for(let i=1;i<=drops;i++){const t=i*step/distance,px=f.x+dx*t,py=f.y+dy*t;
   style.layers.forEach((layer,index)=>this.emitter(markerId,index,layer).emitParticleAt(px+Phaser.Math.Between(-6,6),py+Phaser.Math.Between(-4,8),layer.count??1));
  }
  f.x+=dx*drops*step/distance;f.y+=dy*drops*step/distance;
 }
 private burstEmitter(markerId:string,index:number,layer:Layer):Phaser.GameObjects.Particles.ParticleEmitter{
  const key=markerId+':burst'+index;let emitter=this.emitters.get(key);
  if(!emitter){const rising=layer.fire!==undefined||(layer.config.gravityY as number|undefined??0)<0;
   emitter=this.scene.add.particles(0,0,this.layerTexture(layer),{...layer.config,...this.sizing(layer,1.25),
    speed:rising?{min:50,max:120}:{min:110,max:240},angle:{min:-165,max:-15},gravityY:rising?-60:300,lifespan:Math.max(700,Number(layer.config.lifespan)),emitting:false,maxParticles:200}).setDepth(6);
   this.emitters.set(key,emitter);}
  return emitter;
 }
 /**
  * A capture by a premium marker: a fountain at the marker now, then the
  * marker's particles bloom over sampled captured tiles as the wave reaches them.
  * Others' captures use half the pieces.
  */
 capture(markerId:string,origin:{x:number;y:number},cells:readonly CapturePoint[],local:boolean,now:number):boolean{
  const style=TRAIL_STYLES[markerId],mode=CAPTURE_THEMES[markerId]?.particles;if(!style||!mode)return false;
  // Pieces scale with the captured area so a big capture is covered evenly, within a cap.
  const fire=style.layers.some(l=>l.fire),density=fire?.35:.2,cap=local?(fire?80:50):(fire?35:20);
  const samples=Math.min(cells.length,cap,Math.max(4,Math.round(cells.length*density)));
  if(mode==='full')style.layers.slice(0,isLegendary(markerId)?2:1).forEach((layer,index)=>this.burstEmitter(markerId,index,layer).emitParticleAt(origin.x,origin.y-10,Math.max(2,Math.round((layer.fire?isLegendary(markerId)?7:5:index?8:isLegendary(markerId)?16:10)*(local?1:.5)))));
  const ordered=[...cells].sort((a,b)=>a.delay-b.delay),stride=Math.max(1,ordered.length/samples);
  for(let i=0;i<ordered.length&&this.blooms.length<400;i+=stride){const c=ordered[Math.floor(i)];this.blooms.push({at:now+c.delay,markerId,x:c.x,y:c.y});}
  return true;
 }
 /** A kill by a marker whose capture has particles: a small burst of them where the victim fell. */
 kill(markerId:string,x:number,y:number):void{
  const style=TRAIL_STYLES[markerId];if(!style||!CAPTURE_THEMES[markerId]?.particles)return;
  style.layers.slice(0,2).forEach((layer,index)=>this.burstEmitter(markerId,index,layer).emitParticleAt(x,y-10,layer.fire?5:index?5:8));
 }
 /** Emits blooms whose wave time has come; call once per frame. */
 update(now:number):void{
  if(!this.blooms.length)return;let kept=0;
  for(const b of this.blooms){if(b.at>now){this.blooms[kept++]=b;continue;}
   const style=TRAIL_STYLES[b.markerId];
   style?.layers.forEach((layer,index)=>this.emitter(b.markerId,index,layer).emitParticleAt(b.x+Phaser.Math.Between(-10,10),b.y+Phaser.Math.Between(-8,8),1));
  }this.blooms.length=kept;
 }
 forget(id:string):void{this.followers.delete(id);}
 destroy():void{for(const e of this.emitters.values())e.destroy();this.emitters.clear();this.followers.clear();this.blooms=[];}
}

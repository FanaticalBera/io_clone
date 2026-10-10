import Phaser from 'phaser';
import {markerArt,type MarkerAppearance,type MarkerArt} from './marker-art.js';
import {markerShape,markerSvg,type MarkerShape} from './marker-shapes.js';
/** World units. About 24 CSS px at gameplay zoom; collision is unaffected. */
export const MARKER_DIAMETER=64;
const TEXTURE_PX=160,INK=0x1f1b2d,CREAM=0xfff6e0,BASE_RADIUS=40,JUMP_MS=450;
const loading=new WeakMap<Phaser.Textures.TextureManager,Set<string>>();
export const markerTextureKey=(id:string,body:number)=>'mk:'+id+':'+body.toString(16);
/** Rasterises the vector art once per marker and body colour; null until ready. */
export function markerTexture(textures:Phaser.Textures.TextureManager,id:string,body:number):string|null{
 const key=markerTextureKey(id,body);if(textures.exists(key))return key;
 let pending=loading.get(textures);if(!pending){pending=new Set();loading.set(textures,pending);}
 if(!pending.has(key)){
  pending.add(key);const image=new Image();
  image.onload=()=>{pending!.delete(key);if(!textures.exists(key))textures.addImage(key,image);};
  image.onerror=()=>pending!.delete(key);
  image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markerSvg(id,body,TEXTURE_PX));
 }
 return null;
}
const starPoints=(x:number,y:number,s:number)=>[[0,-1],[.32,-.32],[1,0],[.32,.32],[0,1],[-.32,.32],[-1,0],[-.32,-.32]].map(([a,b])=>({x:x+a*s,y:y+b*s}));
export class PlayerMarker {
 readonly container:Phaser.GameObjects.Container;
 private shadow:Phaser.GameObjects.Graphics;private base:Phaser.GameObjects.Graphics;private pulse:Phaser.GameObjects.Graphics;
 private fallback:Phaser.GameObjects.Graphics;private body:Phaser.GameObjects.Container;private image:Phaser.GameObjects.Image;private fx:Phaser.GameObjects.Graphics;
 private signature='';private art:MarkerArt|null=null;private shape:MarkerShape=markerShape('default');private key='';private ready=false;
 private jumpAt=-Infinity;
 constructor(private scene:Phaser.Scene){
  this.shadow=scene.add.graphics();this.base=scene.add.graphics();this.pulse=scene.add.graphics();this.fallback=scene.add.graphics();
  this.image=scene.add.image(0,0,'__DEFAULT').setVisible(false);this.fx=scene.add.graphics();
  this.body=scene.add.container(0,0,[this.fallback,this.image,this.fx]);
  this.shadow.fillStyle(INK,.28).fillEllipse(0,25,36,10);
  this.container=scene.add.container(0,0,[this.shadow,this.base,this.pulse,this.body]);
 }
 set(appearance:MarkerAppearance,slotColor:number,local:boolean,allowRemoteAppearance=false):void {
  const art=markerArt(appearance,slotColor,local,allowRemoteAppearance);
  const signature=[art.markerId,art.markerColorId,art.bodyColor,slotColor,local].join(':');
  if(signature===this.signature)return;this.signature=signature;this.art=art;this.shape=markerShape(art.markerId);
  this.key=markerTextureKey(art.markerId,art.bodyColor);this.ready=false;this.image.setVisible(false);
  this.fallback.clear().fillStyle(art.bodyColor,1).lineStyle(4,INK,1).fillCircle(0,0,22).strokeCircle(0,0,22).setVisible(true);
  this.base.clear();this.pulse.clear();this.fx.clear();
  // Only the local player stands on a white base, so it is found at a glance.
  if(local)this.base.fillStyle(0xffffff,.55).fillCircle(0,2,BASE_RADIUS).lineStyle(2.5,INK,1).strokeCircle(0,2,BASE_RADIUS+2).lineStyle(3,0xffffff,1).strokeCircle(0,2,BASE_RADIUS);
  this.attach();
 }
 private attach():void{
  if(this.ready||!this.art)return;
  const key=markerTexture(this.scene.textures,this.art.markerId,this.art.bodyColor);if(key!==this.key)return;
  this.ready=true;this.fallback.setVisible(false);
  // Flames flicker from their base, so the image pivots near the bottom.
  const flicker=this.shape.motion==='flicker',originY=flicker?(22+32)/64:.5;
  this.image.setTexture(key).setDisplaySize(MARKER_DIAMETER,MARKER_DIAMETER).setOrigin(.5,originY).setPosition(0,(originY-.5)*MARKER_DIAMETER).setRotation(0).setVisible(true);
 }
 /** A short squash-and-hop, played when this player captures land. */
 jump(now:number):void{this.jumpAt=now;}
 update(now:number):void{
  if(!this.art)return;this.attach();
  let y=Math.sin(now*Math.PI*2/1100)*2-2,sx=1,sy=1;
  const t=(now-this.jumpAt)/JUMP_MS;
  if(t>=0&&t<1){
   if(t<.3){const k=Math.sin(t/.3*Math.PI);sx=1+.18*k;sy=1-.2*k;}
   else if(t<.7){const k=Math.sin((t-.3)/.4*Math.PI);y-=12*k;sx=1-.06*k;sy=1+.08*k;}
   else{const k=Math.sin((t-.7)/.3*Math.PI);sx=1+.06*k;sy=1-.06*k;}
  }
  this.body.setPosition(0,y).setScale(sx,sy);
  if(this.art.local){
   const p=(now%1800)/1800;
   this.pulse.clear().lineStyle(3,0xffffff,.85*(1-p)).strokeCircle(0,2,BASE_RADIUS*(1+.5*p));
  }
  const motion=this.shape.motion;if(!motion)return;
  this.fx.clear();
  if(motion==='orbit'){
   const a=now*Math.PI*2/3200,ex=25*Math.cos(a),ey=9*Math.sin(a),r=-20*Math.PI/180;
   const x=ex*Math.cos(r)-ey*Math.sin(r),yy=ex*Math.sin(r)+ey*Math.cos(r);
   this.fx.fillStyle(0xffc93c,1).lineStyle(2.5,INK,1).fillCircle(x,yy,4.8).strokeCircle(x,yy,4.8);
  }else if(motion==='twinkle'){
   for(const s of this.shape.sparkles??[]){
    const alpha=.5+.5*Math.sin((now/1600+s.phase)*Math.PI*2);if(alpha<.05)continue;
    const points=starPoints(s.x,s.y,s.size*(.6+.4*alpha));
    this.fx.fillStyle(CREAM,alpha).fillPoints(points,true).lineStyle(1.6,INK,alpha).strokePoints(points,true);
   }
  }else if(!this.ready)return;
  else if(motion==='flicker'){
   const k=Math.sin(now*Math.PI*2/700),scale=MARKER_DIAMETER/this.image.width;
   this.image.setScale(scale*(1-.05*k),scale*(1+.06*k));
  }else if(motion==='spin')this.image.setRotation(now*Math.PI*2/5000);
  else{
   // Two quick beats, then a rest.
   const t=now%1200,beat=t<150?Math.sin(t/150*Math.PI):t>220&&t<370?.7*Math.sin((t-220)/150*Math.PI):0;
   this.image.setScale(MARKER_DIAMETER/this.image.width*(1+.12*beat));
  }
 }
 state(){return this.art?{markerId:this.art.markerId,markerColorId:this.art.markerColorId,bodyColor:this.art.bodyColor,slotColor:this.art.slotColor,local:this.art.local,
  selfBase:this.art.local,textureKey:this.key,textureReady:this.ready,diameter:MARKER_DIAMETER,motion:this.shape.motion??null}:null;}
}

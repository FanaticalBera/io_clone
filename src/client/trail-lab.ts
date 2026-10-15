// Dev page (/trail-lab.html): every premium marker runs a loop and captures the
// patch inside it every few seconds, so trails and capture effects compare side by side.
import Phaser from 'phaser';
import {PlayerMarker} from './player-marker.js';
import {MarkerTrails,TRAIL_MARKER_IDS} from './marker-trails.js';
import {markerDefinition} from './catalog.js';
import {disk,axialToWorld} from '../shared/hex.js';
const COLS=6,CELL=300,RADIUS=80,SIDE=19,EVERY=3000,WAVE=250,COLOR=0x4ea8ff;
const PATCH=disk({q:0,r:0},2).map(a=>({...axialToWorld(a.q,a.r,SIDE),ring:Math.max(Math.abs(a.q),Math.abs(a.r),Math.abs(a.q+a.r))}));
const hexPoints=(x:number,y:number,s:number)=>Array.from({length:6},(_,i)=>{const a=Math.PI/180*(60*i-30);return {x:x+Math.cos(a)*s,y:y+Math.sin(a)*s};});
class TrailLab extends Phaser.Scene {
 private runners:{id:string;marker:PlayerMarker;cx:number;cy:number;phase:number;next:number;at:number;x:number;y:number}[]=[];
 private trails!:MarkerTrails;private patches!:Phaser.GameObjects.Graphics;
 create():void{
  const rows=Math.ceil(TRAIL_MARKER_IDS.length/COLS),fit=()=>{const cam=this.cameras.main;cam.setZoom(Math.min(this.scale.width/(COLS*CELL),this.scale.height/(rows*CELL))).centerOn(COLS*CELL/2,rows*CELL/2);};
  this.cameras.main.setBackgroundColor(0xeef1f6);fit();this.scale.on('resize',fit);
  this.trails=new MarkerTrails(this);this.patches=this.add.graphics().setDepth(2);
  const now=performance.now();
  TRAIL_MARKER_IDS.forEach((id,i)=>{
   const cx=(i%COLS+.5)*CELL,cy=(Math.floor(i/COLS)+.5)*CELL,def=markerDefinition(id)!;
   const marker=new PlayerMarker(this);marker.set({markerId:id,markerColorId:'slot'},COLOR,false,true);marker.container.setDepth(5);
   this.add.text(cx,cy+RADIUS+46,(def.legendary?'★ ':'')+def.name,{fontFamily:'Jua, sans-serif',fontSize:'26px',color:def.legendary?'#b07800':'#1f1b2d'}).setOrigin(.5);
   this.runners.push({id,marker,cx,cy,phase:i*.7,next:now+800+(i%6)*350,at:-Infinity,x:cx,y:cy});
  });
 }
 update():void{
  const now=performance.now();this.patches.clear();
  for(const r of this.runners){const a=now/1000*2.9+r.phase;r.x=r.cx+Math.cos(a)*RADIUS;r.y=r.cy+Math.sin(a)*RADIUS*.75;
   r.marker.container.setPosition(r.x,r.y);r.marker.update(now);this.trails.follow(r.id,r.id,r.x,r.y,true,now);
   if(now>=r.next){r.next=now+EVERY;r.at=now;r.marker.jump(now);
    this.trails.capture(r.id,{x:r.x,y:r.y},PATCH.map(p=>({x:r.cx+p.x,y:r.cy+p.y,delay:p.ring/2*WAVE})),true,now);}
   const t=now-r.at;if(t>EVERY*.85)continue;const fade=t<EVERY*.6?1:1-(t-EVERY*.6)/(EVERY*.25);
   for(const p of PATCH){const flipped=t>=p.ring/2*WAVE;this.patches.fillStyle(flipped?COLOR:0xcfe3ff,.75*fade).fillPoints(hexPoints(r.cx+p.x,r.cy+p.y,SIDE-1),true);}
  }
  this.trails.update(now);
 }
}
new Phaser.Game({type:Phaser.AUTO,parent:document.body,backgroundColor:'#eef1f6',scale:{mode:Phaser.Scale.RESIZE,width:'100%',height:'100%'},resolution:window.devicePixelRatio,scene:TrailLab} as Phaser.Types.Core.GameConfig);

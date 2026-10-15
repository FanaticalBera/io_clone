// Dev page (/trail-lab.html): every premium marker runs a loop with its trail, for side-by-side review.
import Phaser from 'phaser';
import {PlayerMarker} from './player-marker.js';
import {MarkerTrails,TRAIL_MARKER_IDS} from './marker-trails.js';
import {markerDefinition} from './catalog.js';
const COLS=6,CELL=300,RADIUS=80;
class TrailLab extends Phaser.Scene {
 private runners:{id:string;marker:PlayerMarker;cx:number;cy:number;phase:number}[]=[];private trails!:MarkerTrails;
 create():void{
  const rows=Math.ceil(TRAIL_MARKER_IDS.length/COLS),fit=()=>{const cam=this.cameras.main;cam.setZoom(Math.min(this.scale.width/(COLS*CELL),this.scale.height/(rows*CELL))).centerOn(COLS*CELL/2,rows*CELL/2);};
  this.cameras.main.setBackgroundColor(0xeef1f6);fit();this.scale.on('resize',fit);
  this.trails=new MarkerTrails(this);
  TRAIL_MARKER_IDS.forEach((id,i)=>{
   const cx=(i%COLS+.5)*CELL,cy=(Math.floor(i/COLS)+.5)*CELL,def=markerDefinition(id)!;
   const marker=new PlayerMarker(this);marker.set({markerId:id,markerColorId:'slot'},0x4ea8ff,false,true);marker.container.setDepth(5);
   this.add.text(cx,cy+RADIUS+46,(def.legendary?'★ ':'')+def.name,{fontFamily:'Jua, sans-serif',fontSize:'26px',color:def.legendary?'#b07800':'#1f1b2d'}).setOrigin(.5);
   this.runners.push({id,marker,cx,cy,phase:i*.7});
  });
 }
 update():void{
  const now=performance.now();
  for(const r of this.runners){const a=now/1000*2.9+r.phase,x=r.cx+Math.cos(a)*RADIUS,y=r.cy+Math.sin(a)*RADIUS*.75;
   r.marker.container.setPosition(x,y);r.marker.update(now);this.trails.follow(r.id,r.id,x,y,true,now);}
 }
}
new Phaser.Game({type:Phaser.AUTO,parent:document.body,backgroundColor:'#eef1f6',scale:{mode:Phaser.Scale.RESIZE,width:'100%',height:'100%'},resolution:window.devicePixelRatio,scene:TrailLab} as Phaser.Types.Core.GameConfig);

// Dev page (/trail-lab.html): every premium marker runs a loop and captures the
// patch inside it every few seconds, so trails and capture effects compare side by side.
import Phaser from 'phaser';
import {PlayerMarker} from './player-marker.js';
import {MarkerTrails,TRAIL_MARKER_IDS} from './marker-trails.js';
import {CAPTURE_THEMES,themedTile,themedEdge,themedEdgeColors,themedRing,themedDelay,tileSpot} from './capture-themes.js';
import {markerDefinition,MARKER_COLORS} from './catalog.js';
import {disk,axialToWorld} from '../shared/hex.js';
const ONLY=new URLSearchParams(location.search).get('only')?.split(','),IDS=ONLY?TRAIL_MARKER_IDS.filter(id=>ONLY.includes(id)):TRAIL_MARKER_IDS;
const COLS=Math.min(6,IDS.length),CELL=380,RADIUS=110,SIDE=22,EVERY=3000,WAVE=250,POP=200,INK=0x1f1b2d;
// Land colour under test: the button steps through the shop's marker colours.
const LAND=[0x4ea8ff,...MARKER_COLORS.flatMap(c=>c.value===null?[]:[c.value])];let land=0,COLOR=LAND[0];
const button=Object.assign(document.createElement('button'),{textContent:'땅 색 바꾸기'});
Object.assign(button.style,{position:'fixed',right:'12px',top:'12px',zIndex:'2',font:'700 15px sans-serif',padding:'8px 14px',borderRadius:'10px',border:'3px solid #1f1b2d',cursor:'pointer'});
const paint=()=>{button.style.background='#'+COLOR.toString(16).padStart(6,'0');};paint();
button.onclick=()=>{land=(land+1)%LAND.length;COLOR=LAND[land];paint();};document.body.append(button);
const corner=(x:number,y:number,i:number)=>{const a=Math.PI/180*(60*i-30);return {x:x+Math.cos(a)*SIDE,y:y+Math.sin(a)*SIDE};};
const AXIALS=disk({q:0,r:0},3),CENTERS=AXIALS.map(a=>axialToWorld(a.q,a.r,SIDE));
// Edge i joins corners i and i+1; it is outside when no patch cell sits across it.
const PATCH=AXIALS.map((a,n)=>{const p=CENTERS[n],ring=Math.max(Math.abs(a.q),Math.abs(a.r),Math.abs(a.q+a.r));
 const outside=[0,1,2,3,4,5].filter(i=>{const v=corner(p.x,p.y,i),w=corner(p.x,p.y,(i+1)%6),nx=v.x+w.x-p.x,ny=v.y+w.y-p.y;return !CENTERS.some(c=>Math.hypot(c.x-nx,c.y-ny)<1);}).map(i=>[i,(i+1)%6]);
 return {...p,ring,outside};});
const MAX_RING=3;
class TrailLab extends Phaser.Scene {
 private runners:{id:string;marker:PlayerMarker;cx:number;cy:number;phase:number;next:number;at:number;ox:number;oy:number}[]=[];
 private trails!:MarkerTrails;private patches!:Phaser.GameObjects.Graphics;private rings!:Phaser.GameObjects.Graphics;
 create():void{
  const rows=Math.ceil(IDS.length/COLS),fit=()=>{const cam=this.cameras.main;cam.setZoom(Math.min(this.scale.width/(COLS*CELL),this.scale.height/(rows*CELL))).centerOn(COLS*CELL/2,rows*CELL/2);};
  this.cameras.main.setBackgroundColor(0xeef1f6);fit();this.scale.on('resize',fit);
  this.trails=new MarkerTrails(this);this.patches=this.add.graphics().setDepth(2);this.rings=this.add.graphics().setDepth(6);
  const now=performance.now();
  IDS.forEach((id,i)=>{
   const cx=(i%COLS+.5)*CELL,cy=(Math.floor(i/COLS)+.5)*CELL,def=markerDefinition(id)!;
   const marker=new PlayerMarker(this);marker.set({markerId:id,markerColorId:'slot'},0x4ea8ff,false,true);marker.container.setDepth(5);
   this.add.text(cx,cy+RADIUS+70,(def.legendary?'★ ':'')+def.name,{fontFamily:'Jua, sans-serif',fontSize:'26px',color:def.legendary?'#b07800':'#1f1b2d'}).setOrigin(.5);
   this.runners.push({id,marker,cx,cy,phase:i*.7,next:now+800+(i%6)*350,at:-Infinity,ox:cx,oy:cy});
  });
 }
 update():void{
  const now=performance.now(),g=this.patches;g.clear();this.rings.clear();
  for(const r of this.runners){const a=now/1000*2.9+r.phase,x=r.cx+Math.cos(a)*RADIUS,y=r.cy+Math.sin(a)*RADIUS*.75;
   r.marker.container.setPosition(x,y);r.marker.update(now);this.trails.follow(r.id,r.id,x,y,true,now);
   const theme=CAPTURE_THEMES[r.id];
   if(now>=r.next){r.next=now+EVERY;r.at=now;r.ox=x;r.oy=y;r.marker.jump(now);
    if(!theme||theme.particles)this.trails.capture(r.id,{x,y},PATCH.map(p=>({x:r.cx+p.x,y:r.cy+p.y,delay:p.ring/MAX_RING*WAVE})),true,now);}
   const t=now-r.at;if(t>EVERY*.85)continue;const fade=t<EVERY*.6?1:1-(t-EVERY*.6)/(EVERY*.25);
   for(const p of PATCH){
    const px=r.cx+p.x,py=r.cy+p.y,spot=tileSpot(px,py,{x:r.ox,y:r.oy},p.ring/MAX_RING,MAX_RING*SIDE*1.8);
    const delay=theme?themedDelay(theme,spot,WAVE):p.ring/MAX_RING*WAVE,local=t-delay;
    const pts=Array.from({length:6},(_,i)=>corner(px,py,i));
    g.fillStyle(local>=0?COLOR:0xcfe3ff,.85*fade).fillPoints(pts,true);
    const tile=theme?themedTile(theme,spot,local,COLOR):null;
    if(tile){const pop=local<POP?1+(tile.pop??.16)*Math.sin(local/POP*Math.PI):1,big=pts.map(v=>({x:px+(v.x-px)*pop,y:py+(v.y-py)*pop}));g.fillStyle(tile.color,tile.alpha).fillPoints(big,true).lineStyle(2,INK,.45*tile.alpha).strokePoints(big,true);}
    if(theme)for(const [i,j] of p.outside){const v=pts[i],w=pts[j],angle=Math.atan2((v.y+w.y)/2-r.oy,(v.x+w.x)/2-r.ox),light=themedEdge(theme,angle,t);
     if(light>0){const c=themedEdgeColors(theme,angle,COLOR);g.lineStyle(5+4*light,c.line,.95*light).lineBetween(v.x,v.y,w.x,w.y).lineStyle(2.5,c.core,light).lineBetween(v.x,v.y,w.x,w.y);}}
   }
   const ring=theme?themedRing(theme,t):null;
   if(theme&&ring)this.rings.lineStyle(7,INK,.5*ring.alpha).strokeCircle(r.ox,r.oy,ring.radius).lineStyle(4,theme.ring,ring.alpha).strokeCircle(r.ox,r.oy,ring.radius);
  }
  this.trails.update(now);
 }
}
new Phaser.Game({type:Phaser.AUTO,parent:document.body,backgroundColor:'#eef1f6',scale:{mode:Phaser.Scale.RESIZE,width:'100%',height:'100%'},resolution:window.devicePixelRatio,scene:TrailLab} as Phaser.Types.Core.GameConfig);

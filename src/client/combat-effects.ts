import Phaser from 'phaser';
import type {MatchView,Vec} from '../shared/model.js';
import {CombatEvents} from './combat-events.js';
import {deathMessage} from './death-message.js';

const INK=0x1f1b2d,STAR=0xffc93c,BURST_MS=650;
// A chunky 13-point star, unit radius.
const STAR_POINTS=[[0,-1],[.22,-.39],[.83,-.61],[.5,-.06],[1,.28],[.33,.33],[.28,1],[-.11,.44],[-.67,.83],[-.44,.17],[-1,-.17],[-.33,-.33],[-.5,-.89]].map(([x,y])=>({x,y}));
type Burst={position:Vec;color:number;born:number;local:boolean;label:Phaser.GameObjects.Text;seed:number;marker:Phaser.GameObjects.Image|null};
export class CombatEffects {
 private cursor=new CombatEvents();private matchId='';private bursts:Burst[]=[];
 private world:Phaser.GameObjects.Graphics;private flash:Phaser.GameObjects.Graphics;private message:Phaser.GameObjects.Text;
 private feedback:{at:number;kind:'KILL'|'DEATH';text:string}|null=null;
 private played=0;private kills=0;private deaths=0;private lastEventId='';private destroyed=false;
 private viewportWidth:number;private viewportHeight:number;private pixelRatio=1;private points:Vec[]=[];
 constructor(private scene:Phaser.Scene,private colors:readonly number[],private onKill:()=>void=()=>{},private onDeath:()=>void=()=>{},private markerTexture:(participantId:string)=>string|null=()=>null){
  this.viewportWidth=scene.scale.width;this.viewportHeight=scene.scale.height;
  this.world=scene.add.graphics().setDepth(8);this.flash=scene.add.graphics().setScrollFactor(0).setDepth(10);
  this.message=scene.add.text(0,0,'',{fontFamily:'Jua, Gothic A1, sans-serif',fontSize:'28px',color:'#1f1b2d',stroke:'#ffffff',strokeThickness:7,align:'center'}).setOrigin(.5).setScrollFactor(0).setDepth(11).setVisible(false);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.destroy());scene.events.once(Phaser.Scenes.Events.DESTROY,()=>this.destroy());
 }
 setViewport(width:number,height:number,ratio:number):void{
  this.viewportWidth=width;this.viewportHeight=height;this.pixelRatio=ratio;
  this.message.setResolution(ratio);for(const burst of this.bursts)burst.label.setResolution(ratio);
 }
 accept(view:MatchView,selfId:string|null,reset=false):void{
  if(reset||this.matchId!==view.matchId||!selfId){
   this.clear();this.matchId=view.matchId;this.played=0;this.kills=0;this.deaths=0;this.lastEventId='';
   this.cursor.accept(view,true);return;
  }
  const now=performance.now();
  const events=this.cursor.accept(view),localDeath=events.some(event=>event.participantId===selfId);
  for(const event of events){
   const victim=view.participants.find(p=>p.participantId===event.participantId),position=event.position??victim?.position;
   if(!position)continue;
   const killed=event.killerId===selfId&&event.participantId!==selfId,dead=event.participantId===selfId;
   const color=this.colors[victim?.slot??0];
   const label=this.scene.add.text(position.x,position.y-35,killed?'처치!':dead?'탈락':event.reason==='WALL_HIT'?'벽 충돌':'선 절단',{
    fontFamily:'Jua, Gothic A1, sans-serif',fontSize:killed||dead?'24px':'16px',color:'#1f1b2d',stroke:'#ffffff',strokeThickness:6,resolution:this.pixelRatio
   }).setOrigin(.5).setDepth(9);
   // The fallen piece reuses the victim's marker texture when it is ready.
   const key=this.markerTexture(event.participantId),marker=key?this.scene.add.image(position.x,position.y,key).setDisplaySize(64,64).setDepth(7.5):null;
   this.bursts.push({position:{...position},color,born:now,local:killed||dead,label,marker,seed:[...event.eventId].reduce((n,c)=>n+c.charCodeAt(0),0)});
   while(this.bursts.length>24){const old=this.bursts.shift()!;old.label.destroy();old.marker?.destroy();}this.played++;this.lastEventId=event.eventId;
   if(dead){this.deaths++;this.onDeath();this.feedback={at:now,kind:'DEATH',text:deathMessage(event.reason,event.deathContext)};}
   else if(killed){this.kills++;if(!localDeath)this.onKill();if(this.feedback?.kind!=='DEATH'||this.feedback.at!==now)this.feedback={at:now,kind:'KILL',text:'처치!\n'+(victim?.nickname??'상대')};}
  }
 }
 private poly(cx:number,cy:number,unit:readonly Vec[],radius:number,rotation=0):Vec[]{
  while(this.points.length<unit.length)this.points.push({x:0,y:0});this.points.length=unit.length;
  const c=Math.cos(rotation),s=Math.sin(rotation);
  unit.forEach((p,i)=>{this.points[i].x=cx+(p.x*c-p.y*s)*radius;this.points[i].y=cy+(p.x*s+p.y*c)*radius;});return this.points;
 }
 update(now:number):void{
  this.world.clear();this.flash.clear();
  const alive:Burst[]=[],hex=Array.from({length:6},(_,k)=>({x:Math.cos(k*Math.PI/3),y:Math.sin(k*Math.PI/3)}));
  for(const burst of this.bursts){
   const elapsed=now-burst.born,t=Math.min(1,elapsed/BURST_MS);if(t>=1){burst.label.destroy();burst.marker?.destroy();continue;}alive.push(burst);
   const fade=1-t,ease=1-Math.pow(1-t,3),{x,y}=burst.position;
   // Impact star: pops past full size, then fades.
   if(t<.5){const grow=t<.12?t/.12*1.25:1.25-.25*Math.min(1,(t-.12)/.1),alpha=t<.25?1:1-(t-.25)/.25,r=(burst.local?46:34)*grow;
    this.world.fillStyle(STAR,alpha).fillPoints(this.poly(x,y,STAR_POINTS,r,burst.seed*.1),true).lineStyle(4,INK,alpha).strokePoints(this.points,true);}
   // The piece tips over and fades while its hex shards fly and fall.
   if(burst.marker){const tip=Math.min(1,t/.35);burst.marker.setRotation((burst.seed%2?1:-1)*tip*1.47).setPosition(x,y+10*tip).setAlpha(t<.4?1:1-(t-.4)/.6);}
   const count=burst.local?8:6;
   for(let i=0;i<count;i++){
    const angle=i*Math.PI*2/count+burst.seed*.37,distance=24+ease*(i%2?62:84),sx=x+Math.cos(angle)*distance,sy=y+Math.sin(angle)*distance+150*t*t;
    const alpha=1-t*t;this.world.fillStyle(burst.color,alpha).fillPoints(this.poly(sx,sy,hex,9*(1-.3*t),i+t*7),true).lineStyle(2.5,INK,alpha).strokePoints(this.points,true);
   }
   burst.label.setPosition(x,y-46-ease*40).setAlpha(Math.min(1,fade*2)).setScale(1+Math.sin(Math.min(1,t*4)*Math.PI)*.25);
  }
  this.bursts=alive;
  if(!this.feedback){this.message.setVisible(false);return;}
  const elapsed=now-this.feedback.at,kill=this.feedback.kind==='KILL',duration=kill?900:650;
  if(elapsed>=duration){this.feedback=null;this.message.setVisible(false);return;}
  const width=this.viewportWidth,height=this.viewportHeight;
  // Scroll-factor-zero objects still zoom around the backing viewport centre.
  const offsetX=(this.scene.scale.width-width)/2,offsetY=(this.scene.scale.height-height)/2,alpha=Math.min(1,(duration-elapsed)/200);
  if(kill&&elapsed<140){this.flash.fillStyle(0x23d6bb,.24*(1-elapsed/140));this.flash.fillRect(offsetX,offsetY,width,height);}
  this.message.setVisible(true).setText(this.feedback.text).setPosition(offsetX+width/2,offsetY+height*.31).setFontSize(width<600?23:32)
   .setAlpha(alpha).setScale(1+.22*Math.max(0,1-elapsed/180));
 }
 state():{played:number;kills:number;deaths:number;active:number;lastEventId:string;feedback:string|null}{
  return {played:this.played,kills:this.kills,deaths:this.deaths,active:this.bursts.length,lastEventId:this.lastEventId,feedback:this.feedback?.kind??null};
 }
 private clear():void{for(const burst of this.bursts){burst.label.destroy();burst.marker?.destroy();}this.bursts=[];this.world.clear();this.flash.clear();this.message.setVisible(false);this.feedback=null;}
 private destroy():void{if(this.destroyed)return;this.destroyed=true;this.clear();this.world.destroy();this.flash.destroy();this.message.destroy();}
}

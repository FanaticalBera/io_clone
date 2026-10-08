import Phaser from 'phaser';
import type {MatchView,Vec} from '../shared/model.js';
import {CombatEvents} from './combat-events.js';
import {deathMessage} from './death-message.js';

type Burst={position:Vec;color:number;born:number;local:boolean;label:Phaser.GameObjects.Text;seed:number};
export class CombatEffects {
 private cursor=new CombatEvents();private matchId='';private bursts:Burst[]=[];
 private world:Phaser.GameObjects.Graphics;private flash:Phaser.GameObjects.Graphics;private message:Phaser.GameObjects.Text;
 private feedback:{at:number;kind:'KILL'|'DEATH';text:string}|null=null;
 private played=0;private kills=0;private deaths=0;private lastEventId='';private destroyed=false;
 private viewportWidth:number;private viewportHeight:number;private pixelRatio=1;
 constructor(private scene:Phaser.Scene,private colors:readonly number[],private onKill:()=>void=()=>{},private onDeath:()=>void=()=>{}){
  this.viewportWidth=scene.scale.width;this.viewportHeight=scene.scale.height;
  this.world=scene.add.graphics().setDepth(8);this.flash=scene.add.graphics().setScrollFactor(0).setDepth(10);
  this.message=scene.add.text(0,0,'',{fontFamily:'Malgun Gothic, sans-serif',fontSize:'28px',fontStyle:'bold',color:'#1f1b2d',stroke:'#ffffff',strokeThickness:7,align:'center'}).setOrigin(.5).setScrollFactor(0).setDepth(11).setVisible(false);
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
   const color=dead?0xff7084:this.colors[victim?.slot??0];
   const label=this.scene.add.text(position.x,position.y-35,killed?'선 절단!':dead?'탈락':event.reason==='WALL_HIT'?'벽 충돌':'선 절단',{
    fontFamily:'Malgun Gothic, sans-serif',fontSize:killed||dead?'24px':'16px',fontStyle:'bold',color:'#1f1b2d',stroke:'#ffffff',strokeThickness:6,resolution:this.pixelRatio
   }).setOrigin(.5).setDepth(9);
   this.bursts.push({position:{...position},color,born:now,local:killed||dead,label,seed:[...event.eventId].reduce((n,c)=>n+c.charCodeAt(0),0)});
   while(this.bursts.length>24)this.bursts.shift()!.label.destroy();this.played++;this.lastEventId=event.eventId;
   if(dead){this.deaths++;this.onDeath();this.feedback={at:now,kind:'DEATH',text:deathMessage(event.reason,event.deathContext)};}
   else if(killed){this.kills++;if(!localDeath)this.onKill();if(this.feedback?.kind!=='DEATH'||this.feedback.at!==now)this.feedback={at:now,kind:'KILL',text:'처치!\n'+(victim?.nickname??'상대')};}
  }
 }
 update(now:number):void{
  this.world.clear();this.flash.clear();
  const alive:Burst[]=[];
  for(const burst of this.bursts){
   const elapsed=now-burst.born,t=Math.min(1,elapsed/650);if(t>=1){burst.label.destroy();continue;}alive.push(burst);
   const fade=1-t,ease=1-Math.pow(1-t,3),radius=12+ease*(burst.local?105:70),{x,y}=burst.position;
   this.world.lineStyle(5*fade+1,burst.color,fade*.9);this.world.strokeCircle(x,y,radius);
   this.world.lineStyle(3,0xffffff,fade);this.world.strokeCircle(x,y,radius*.64);
   const count=burst.local?16:10;
   for(let i=0;i<count;i++){
    const angle=i*Math.PI*2/count+burst.seed*.1,dx=Math.cos(angle),dy=Math.sin(angle),distance=18+ease*(i%2?radius:radius*1.5);
    const sx=x+dx*distance,sy=y+dy*distance,size=(5+i%3)*fade;
    this.world.fillStyle(i%3===0?0xffffff:burst.color,fade);this.world.fillTriangle(sx+dx*size,sy+dy*size,sx-dy*size-dx*size,sy+dx*size-dy*size,sx+dy*size-dx*size,sy-dx*size-dy*size);
    if(t<.3){this.world.lineStyle(3,0xffffff,(1-t/.3)*.9);this.world.lineBetween(x+dx*10,y+dy*10,x+dx*(radius+25),y+dy*(radius+25));}
   }
   if(t<.2){this.world.fillStyle(0xffffff,1-t/.2);this.world.fillCircle(x,y,30*(1-t/.2));}
   burst.label.setPosition(x,y-40-ease*45).setAlpha(Math.min(1,fade*2)).setScale(1+Math.sin(Math.min(1,t*4)*Math.PI)*.25);
  }
  this.bursts=alive;
  if(!this.feedback){this.message.setVisible(false);return;}
  const elapsed=now-this.feedback.at,kill=this.feedback.kind==='KILL',duration=kill?900:650;
  if(elapsed>=duration){this.feedback=null;this.message.setVisible(false);return;}
  const width=this.viewportWidth,height=this.viewportHeight;
  // Scroll-factor-zero objects still zoom around the backing viewport centre.
  const offsetX=(this.scene.scale.width-width)/2,offsetY=(this.scene.scale.height-height)/2;
  if(elapsed<140){this.flash.fillStyle(kill?0x23d6bb:0xff4568,.24*(1-elapsed/140));this.flash.fillRect(offsetX,offsetY,width,height);}
  this.message.setVisible(true).setText(this.feedback.text).setPosition(offsetX+width/2,offsetY+height*.31).setFontSize(width<600?23:32)
   .setAlpha(Math.min(1,(duration-elapsed)/200)).setScale(1+.22*Math.max(0,1-elapsed/180));
 }
 state():{played:number;kills:number;deaths:number;active:number;lastEventId:string;feedback:string|null}{
  return {played:this.played,kills:this.kills,deaths:this.deaths,active:this.bursts.length,lastEventId:this.lastEventId,feedback:this.feedback?.kind??null};
 }
 private clear():void{for(const burst of this.bursts)burst.label.destroy();this.bursts=[];this.world.clear();this.flash.clear();this.message.setVisible(false);this.feedback=null;}
 private destroy():void{if(this.destroyed)return;this.destroyed=true;this.clear();this.world.destroy();this.flash.destroy();this.message.destroy();}
}

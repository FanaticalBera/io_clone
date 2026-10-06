import type {BotVariant} from '../shared/bot-experiment.js';
import {retryHumanRun} from '../shared/retry.js';
import {createMatch,stepMatch,buildView} from '../shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBotForTick,watchBotDecisions,type BotMemory} from '../shared/bot.js';
import {watchDeaths,type DeathTrace} from '../shared/life.js';
import type {ShadowOpportunity} from '../shared/bot-opportunity.js';
import type {MatchState,MatchView,Vec,DirectionInput} from '../shared/model.js';
import {validateConfig,type GameConfig} from '../shared/config.js';
import type {GameModeConfig} from '../shared/modes.js';
export class PracticeSession {
 readonly selfId='local-human';readonly match:MatchState;
 private memories=new Map<string,BotMemory>();private direction:Vec|null=null;private seq=0;
 private frame=0;private lastTime:number|null=null;private accumulated=0;private disposed=false;private paused=false;
 private diagnosticStops:(()=>void)[]=[];
 private diagnosticData:{deathCauses:Record<string,number>;decisionCount:number;escapeDecisionCount:number;clearDecisionCount:number;missedReasons:Record<string,number>;candidateReasons:Record<string,number>;deaths:DeathTrace[];missed:ShadowOpportunity[]}|null=null;
 private visibility=()=>{this.lastTime=null;this.accumulated=0;};
 constructor(nickname:string,private publish:(view:MatchView,selfId:string)=>void,config:Partial<GameConfig>={},options:{seed?:number;autoStart?:boolean;gameMode?:GameModeConfig;diagnostics?:boolean;botVariant?:BotVariant}={}){
  const seed=options.seed??crypto.getRandomValues(new Uint32Array(1))[0],matchId='practice-'+seed+'-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>n.toString(16).padStart(2,'0')).join('');
  this.match=createMatch(config,seed,[{participantId:this.selfId,slot:0,nickname,kind:'HUMAN'},...botSpecs(validateConfig(config).maxSlots-1,1,matchId)],matchId,options.gameMode);
  for(const p of this.match.participants)if(p.kind==='BOT')this.memories.set(p.participantId,createBotMemory(seed^(p.slot*2654435761),options.botVariant));
  if(options.diagnostics){
   const data:NonNullable<PracticeSession['diagnosticData']>={deathCauses:{},decisionCount:0,escapeDecisionCount:0,clearDecisionCount:0,missedReasons:{},candidateReasons:{},deaths:[],missed:[]};this.diagnosticData=data;
   this.diagnosticStops.push(watchDeaths(this.match,trace=>{const cause=trace.context?.cause??trace.reason;data.deathCauses[cause]=(data.deathCauses[cause]??0)+1;data.deaths.push(trace);if(data.deaths.length>16)data.deaths.shift();}));
   for(const memory of this.memories.values())this.diagnosticStops.push(watchBotDecisions(memory,trace=>{const f=trace.shadow;if(!f)return;
    data.decisionCount++;if(f.goalBefore==='ESCAPE')data.escapeDecisionCount++;if(f.clearCount)data.clearDecisionCount++;
    for(const c of f.candidates)data.candidateReasons[c.reason]=(data.candidateReasons[c.reason]??0)+1;
    if(f.missed){data.missedReasons[f.missedReason!]=(data.missedReasons[f.missedReason!]??0)+1;data.missed.push(f);if(data.missed.length>64)data.missed.shift();}
   }));
  }
  this.publish(buildView(this.match),this.selfId);
  if(options.autoStart!==false){
   document.addEventListener('visibilitychange',this.visibility);const loop=(time:number)=>{if(this.disposed)return;this.advance(time);this.frame=requestAnimationFrame(loop);};this.frame=requestAnimationFrame(loop);
  }
 }
 retryRun():boolean {
  const human=this.match.participants.find(p=>p.participantId===this.selfId)!;
  if(!retryHumanRun(this.match,human))return false;
  this.direction=null;this.seq=0;this.lastTime=null;this.accumulated=0;this.publish(buildView(this.match),this.selfId);return true;
 }
 setDirection(direction:Vec):void {this.direction={...direction};}
 diagnostics(){return this.diagnosticData?structuredClone({matchId:this.match.matchId,seed:this.match.seed,tick:this.match.tick,...this.diagnosticData}):null;}
 setPaused(paused:boolean):void {this.paused=paused;this.lastTime=null;this.accumulated=0;}
 advance(now:number):void {
  if(this.disposed||this.paused||(typeof document!=='undefined'&&document.hidden)||this.match.phase!=='RUNNING'||this.match.participants.find(p=>p.participantId===this.selfId)?.lifeState==='ELIMINATED'){this.lastTime=now;return;}
  if(this.lastTime===null){this.lastTime=now;return;}
  const delta=(now-this.lastTime)/1000;this.lastTime=now;
  if(delta<0||delta>1){this.accumulated=0;return;}this.accumulated+=delta;
  const step=1/this.match.config.simulationHz;let count=0;
  while(this.accumulated+1e-9>=step&&count<5&&this.match.phase==='RUNNING'){
   const inputs=new Map<string,DirectionInput>();
   const human=this.match.participants.find(p=>p.participantId===this.selfId)!;
   if(this.direction&&human.lifeState==='ALIVE')inputs.set(this.selfId,{matchId:this.match.matchId,lifeId:human.lifeId,seq:++this.seq,dx:this.direction.x,dy:this.direction.y});
   for(const p of this.match.participants)if(p.kind==='BOT'&&p.lifeState==='ALIVE'){
    const input=getBotInput(observeBotForTick(this.match,p.participantId,this.memories.get(p.participantId)!),this.memories.get(p.participantId)!);if(input)inputs.set(p.participantId,input);
   }
   const lifeId=human.lifeId;stepMatch(this.match,inputs);
   if(human.lifeId!==lifeId){this.direction={...human.direction};this.seq=0;}
   this.accumulated-=step;count++;if(human.lifeState==='ELIMINATED'){this.accumulated=0;break;}
  }
  if(count)this.publish(buildView(this.match),this.selfId);
 }
 dispose():void {this.disposed=true;if(typeof cancelAnimationFrame!=='undefined')cancelAnimationFrame(this.frame);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);for(const stop of this.diagnosticStops)stop();this.diagnosticStops=[];this.memories.clear();}
}


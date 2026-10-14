// Shared fixed-input match scenarios for the performance tools (performance PRD 5, stage 0/3).
// Modules load from a source checkout so a frozen commit and a candidate run the exact same driver.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export type ScenarioName='bots14'|'practice';
export const FREEZE_SEEDS=[4,19,73,11,31,47,101,137];
export async function loadModules(source:string){
 const load=(f:string)=>import(pathToFileURL(resolve(source,'src/shared',f+'.ts')).href);
 const [game,bot,identity,director,respawn]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn'].map(load));
 return {game,bot,identity,director,respawn};
}
export type Modules=Awaited<ReturnType<typeof loadModules>>;
// Deterministic human for the practice scenario: its own xorshift stream, never the match or bot RNG.
function humanScript(seed:number){
 let state=(seed^0x9e3779b9)>>>0||1,angle=0,until=0;
 return (tick:number)=>{if(tick>=until){state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;angle+=((state%7)-3)*0.6;until=tick+30+(state>>>8)%60;}return {x:Math.cos(angle),y:Math.sin(angle)};};
}
/** bots14 matches the bot freeze protocol exactly (14 bots, radius 56, safe respawn). practice is 1 scripted human + 13 bots. */
export function createScenario(m:Modules,name:ScenarioName,seed:number){
 const {game,bot,identity,director,respawn}=m;
 const human={participantId:'local-human',slot:0,nickname:'perf',kind:'HUMAN' as const};
 const specs=name==='bots14'?bot.botSpecs(14,0,'bot',{seed}):[human,...bot.botSpecs(13,1,'bot',{seed,existing:[human]})];
 const match=game.createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},seed,specs);respawn.setSafeBotRespawn(match,true);
 const memories=new Map<string,any>(match.participants.filter((p:any)=>p.kind==='BOT').map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const steer=humanScript(seed);let seq=0;
 /** Bot inputs plus the scripted human; returned so callers can hash or time them. */
 const inputs=()=>{const result=director.getBotInputs(match,memories) as Map<string,any>;
  const h=match.participants.find((p:any)=>p.participantId==='local-human');
  if(h&&h.lifeState==='ALIVE'){const d=steer(match.tick);result.set(h.participantId,{matchId:match.matchId,lifeId:h.lifeId,seq:++seq,dx:d.x,dy:d.y});}
  return result;};
 return {match,memories,inputs,step:(i:Map<string,any>)=>game.stepMatch(match,i)};
}

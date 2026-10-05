import {startFrameMeter} from './frame-meter.js';
import {createMatch,buildView} from '../shared/game.js';
import {botSpecs} from '../shared/bot.js';
import {createRenderer} from './game-scene.js';
import {InputAdapter} from './input.js';
import {PracticeSession} from './practice.js';
import {NetworkSession,clearSessionToken} from './network.js';
import {UI} from './ui.js';
import {SettingsStore} from './settings.js';
import {KillHaptics} from './haptics.js';
import type {MatchView} from '../shared/model.js';
import type {WireSnapshot,RoomView} from '../shared/protocol.js';
import {createMode,type GameModeConfig,type GameModeId} from '../shared/modes.js';
import {experimentalMapConfig,experimentalSeed,experimentalSlotConfig} from '../shared/map-experiment.js';
import {experimentalTerritoryEffect} from './territory-effect-model.js';
import './style.css';
let practice:PracticeSession|null=null,online:NetworkSession|null=null,lastOnlineAction:(()=>Promise<void>)|null=null,expired=false;
const settings=new SettingsStore(),haptics=new KillHaptics(()=>settings.get().killVibration);
const diagnosticsEnabled=new URLSearchParams(location.search).get('debug')==='1';
if(diagnosticsEnabled)Object.assign(window,{__HEXHOLD_DIAGNOSTICS__:{get:()=>practice?.diagnostics()??null}});
const ui=new UI({practice:()=>void startPractice(),leave:()=>void leave(),restart:()=>{if(ui.mode==='ONLINE')ui.message('다음 판 참가 상태입니다. 방에 남아 있으면 자동 시작합니다.');else void startPractice(practice?.match.gameMode);},
 quick:()=>void enterOnline('room:quickJoin'),create:()=>void enterOnline('room:create'),join:code=>void enterOnline('room:join',code),start:()=>void startOnline(),retry:()=>void retryOnline(),settingsOpen:open=>{input.enabled=false;practice?.setPaused(open||document.hidden);if(!open&&scene.view&&scene.selfId)display(scene.view,scene.selfId);},testVibration:()=>haptics.kill()},settings);
const scene=createRenderer('field');
scene.setTerritoryEffect(experimentalTerritoryEffect(new URLSearchParams(location.search).get('experimentTerritoryEffect'),import.meta.env.DEV||import.meta.env.MODE==='test'));
scene.setKillFeedback(()=>{haptics.kill();});
scene.setDeathFeedback(()=>{haptics.death();});
const testHistory:WireSnapshot[]=[];
const input=new InputAdapter(document.querySelector('#field')!,(x,y)=>scene.pointerDirection(x,y),direction=>{if(practice)practice.setDirection(direction);else online?.sendDirection(direction);});input.enabled=false;
input.attachJoystick(document.querySelector('#joystick')!);
input.setMobileControls(settings.get().mobileControls);settings.subscribe(value=>{input.setMobileControls(value.mobileControls);if(!value.killVibration)haptics.stop();});
if(import.meta.env.MODE==='test')Object.assign(window,{__HEXHOLD_TEST__:{history:testHistory,inputDirection:()=>({...input.direction}),pointerDirection:(x:number,y:number)=>scene.pointerDirection(x,y),getView:()=>structuredClone(scene.view),getRenderState:()=>scene.renderState(),getResourceState:()=>scene.resourceState(),camera:(x:number,y:number)=>scene.testCamera(x,y),culling:(enabled:boolean)=>scene.setChunkCulling(enabled),getCombatState:()=>scene.combatState(),getTerritoryEffectState:()=>scene.territoryEffectState(),getPractice:()=>practice,transportClose:(reconnect=true)=>online?.testTransportClose(reconnect),reconnect:()=>online?.testReconnect(),enabled:()=>input.enabled,direction:(x:number,y:number)=>input.setDirection({x,y})}});
const preview=()=>scene.setView(buildView(createMatch({},71,botSpecs(8))),null);
function display(view:MatchView,selfId:string,init=false):void {
 const previousMatchId=scene.view?.matchId,previous=scene.view?.participants.find(p=>p.participantId===selfId);
 if(ui.mode!=='PRACTICE'&&(init||ui.mode!=='ONLINE'))ui.showGame('ONLINE');
 scene.setView(view,selfId,ui.mode==='ONLINE',init);ui.updateView(view,selfId);ui.clearMessage();const self=view.participants.find(p=>p.participantId===selfId)!;
 const playable=!document.hidden&&!ui.isSettingsOpen()&&view.phase==='RUNNING'&&(ui.mode==='PRACTICE'||!!online?.hasCurrentState);
 if(playable&&(self.lifeState==='DEAD_WAIT'||self.lifeState==='SPAWN_BLOCKED'))input.suspendForRespawn();
 else input.enabled=playable&&self.lifeState==='ALIVE';
 if(self.lifeState==='ALIVE'&&(init||previous?.lifeId!==self.lifeId||previousMatchId!==view.matchId))input.setDirection(self.targetDirection??self.direction);
 if(input.enabled)input.resumeHeldTouch();
}
async function stopOnline():Promise<void> {
 const old=online;online=null;if(!old)return;
 try{await old.leave();}catch{clearSessionToken();}finally{old.dispose();}
}
async function startPractice(gameMode:GameModeConfig=createMode(ui.selectedGameMode())):Promise<void> {
 try{const nickname=ui.nickname();input.enabled=false;input.reset();practice?.dispose();practice=null;await stopOnline();ui.clearMessage();ui.showGame('PRACTICE');
 const experimentParams=new URLSearchParams(location.search),experimentEnabled=import.meta.env.DEV||import.meta.env.MODE==='test',experiment={...experimentalMapConfig(experimentParams.get('experimentMapRadius'),experimentEnabled),...experimentalSlotConfig(experimentParams.get('experimentSlots'),experimentEnabled)},seed=experimentalSeed(experimentParams.get('experimentSeed'),experimentEnabled);
 practice=new PracticeSession(nickname,(v,id)=>display(v,id),experiment, {seed,gameMode,diagnostics:diagnosticsEnabled});input.setDirection(practice.match.participants[0].direction);}
 catch(error){ui.message((error as Error).message);}
}
function onRoom(view:RoomView):void {
 if(view.phase!=='RUNNING'||online?.hasCurrentState)ui.clearMessage();
 if(view.waitingForNextRound||view.phase==='WAITING'||view.phase==='COUNTDOWN'){input.enabled=false;preview();ui.showRoom(view);}
 else if(view.phase==='RESULTS'&&view.results&&view.selfParticipantId){ui.mode='ONLINE';ui.showResults(view.matchId!,view.results,view.selfParticipantId,view.gameMode,view.outcome,view.mapCellCount);input.enabled=false;}
}
async function enterOnline(event:'room:quickJoin'|'room:create'|'room:join',code?:string,gameMode:GameModeId=ui.selectedGameMode()):Promise<void> {
 lastOnlineAction=()=>enterOnline(event,code,gameMode);let activeSession:NetworkSession|null=null;
 try{
  const nickname=ui.nickname();input.enabled=false;input.reset();practice?.dispose();practice=null;await stopOnline();
  if(expired){clearSessionToken();expired=false;}
  ui.message('대전 서버에 연결하고 있어요.');
  const session=new NetworkSession({input:(direction,seq)=>scene.setLocalInput(direction,seq),room:onRoom,view:display,snapshot:raw=>{
if(import.meta.env.MODE==='test'){testHistory.push(raw);if(testHistory.length>512)testHistory.shift();}},error:error=>{expired=error.code==='SESSION_EXPIRED';input.enabled=false;scene.freezePresentation();ui.message(error.message,true);},connected:connected=>{if(!connected){input.enabled=false;scene.freezePresentation();ui.message('연결을 복구하고 있어요.',true);}}});online=session;activeSession=session;
  await session.connect();if(online!==session)return;const response=await session.command(event,{nickname,...(code?{code}:{}),...(event!=='room:join'?{gameMode}:{})});if(!response.ok)ui.message(response.message,true);
 }catch(error){if(activeSession&&online!==activeSession)return;ui.message((error as Error).message||'서버에 연결할 수 없어요.',true);}
}
async function startOnline():Promise<void>{try{const response=await online?.command('room:start');if(response&&!response.ok)ui.message(response.message);}catch(error){ui.message((error as Error).message,true);}}
async function retryOnline():Promise<void>{await stopOnline();if(expired){clearSessionToken();expired=false;}if(lastOnlineAction)await lastOnlineAction();}
async function leave():Promise<void>{haptics.stop();input.enabled=false;input.reset();practice?.dispose();practice=null;await stopOnline();ui.clearMessage();ui.showMenu();preview();}
const invited=new URLSearchParams(location.search).get('room');if(invited){document.querySelector<HTMLInputElement>('#room-code')!.value=invited.toUpperCase();ui.message('초대받은 방 코드가 입력됐어요. 닉네임을 정하고 입장하세요.');}
ui.showMenu();preview();






document.addEventListener('visibilitychange',()=>{
 haptics.stop();input.reset();input.enabled=false;scene.freezePresentation();practice?.setPaused(document.hidden||ui.isSettingsOpen());
 if(online)void online.setBackground(document.hidden).catch(error=>ui.message((error as Error).message,true));
 else if(practice&&!document.hidden)display(buildView(practice.match),practice.selfId,true);
});


startFrameMeter();

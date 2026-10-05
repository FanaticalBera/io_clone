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
import {experimentalCaptureEffect} from './territory-capture-model.js';
import {ShopUI} from './shop-ui.js';
import type {PlayerProfileV1} from './profile.js';
import {ProfileStore} from './profile-store.js';
import {RewardService} from './reward-service.js';
import './style.css';
let practice:PracticeSession|null=null,online:NetworkSession|null=null,lastOnlineAction:(()=>Promise<void>)|null=null,expired=false,runRetryPending=false;
const settings=new SettingsStore(),haptics=new KillHaptics(()=>settings.get().killVibration);
const diagnosticsEnabled=new URLSearchParams(location.search).get('debug')==='1';
if(diagnosticsEnabled)Object.assign(window,{__HEXHOLD_DIAGNOSTICS__:{get:()=>practice?.diagnostics()??null}});
const ui=new UI({rewardRetry:()=>{if(ui.currentRunResult)void rewards.present(ui.currentRunResult,true);},practice:()=>void startPractice(),leave:()=>void leave(),restart:()=>void restartRun(),
 quick:()=>void enterOnline('room:quickJoin'),create:()=>void enterOnline('room:create'),join:code=>void enterOnline('room:join',code),start:()=>void startOnline(),retry:()=>void retryOnline(),settingsOpen:open=>{input.enabled=false;practice?.setPaused(open||document.hidden);if(!open&&scene.view&&scene.selfId)display(scene.view,scene.selfId);},testVibration:()=>haptics.kill()},settings);
const profileStore=new ProfileStore(),rewards=new RewardService(profileStore,(id,receipt)=>ui.showReward(id,receipt));
const shop=new ShopUI(profileStore,()=>ui.mode==='MENU',applyProfile);
function applyProfile(p:PlayerProfileV1):void {ui.setProfileBalance(p.coins);shop.setProfile(p);scene.setMarkerAppearance({markerId:p.inventory.equippedMarkerId,markerColorId:p.inventory.equippedMarkerColorId});}
profileStore.subscribe(applyProfile);void profileStore.read().then(applyProfile).catch(()=>ui.setProfileBalance(null));
const scene=createRenderer('field');
scene.setTerritoryEffect(experimentalTerritoryEffect(new URLSearchParams(location.search).get('experimentTerritoryEffect'),import.meta.env.DEV||import.meta.env.MODE==='test'));
scene.setCaptureEffect(experimentalCaptureEffect(new URLSearchParams(location.search).get('experimentCaptureEffect'),import.meta.env.DEV||import.meta.env.MODE==='test'));
scene.setKillFeedback(()=>{haptics.kill();});
scene.setDeathFeedback(()=>{haptics.death();});
const testHistory:WireSnapshot[]=[];
const input=new InputAdapter(document.querySelector('#field')!,(x,y)=>scene.pointerDirection(x,y),direction=>{if(practice)practice.setDirection(direction);else online?.sendDirection(direction);});input.enabled=false;
input.attachJoystick(document.querySelector('#joystick')!);
input.setMobileControls(settings.get().mobileControls);settings.subscribe(value=>{input.setMobileControls(value.mobileControls);if(!value.killVibration)haptics.stop();});
if(import.meta.env.MODE==='test')Object.assign(window,{__HEXHOLD_TEST__:{getMarkerState:()=>scene.markerState(),profile:()=>profileStore.read(),rewardRetry:()=>ui.currentRunResult&&rewards.present(ui.currentRunResult,true),history:testHistory,inputDirection:()=>({...input.direction}),pointerDirection:(x:number,y:number)=>scene.pointerDirection(x,y),getView:()=>structuredClone(scene.view),getRenderState:()=>scene.renderState(),getResourceState:()=>scene.resourceState(),camera:(x:number,y:number)=>scene.testCamera(x,y),culling:(enabled:boolean)=>scene.setChunkCulling(enabled),getCombatState:()=>scene.combatState(),getTerritoryEffectState:()=>scene.territoryEffectState(),getCaptureEffectState:()=>scene.captureEffectState(),getPractice:()=>practice,showPracticeView:()=>{if(practice)display(buildView(practice.match),practice.selfId);},transportClose:(reconnect=true)=>online?.testTransportClose(reconnect),reconnect:()=>online?.testReconnect(),enabled:()=>input.enabled,direction:(x:number,y:number)=>input.setDirection({x,y})}});
const preview=()=>scene.setView(buildView(createMatch({},71,botSpecs(8))),null);
function display(view:MatchView,selfId:string,init=false):void {
 if(view.participants.find(p=>p.participantId===selfId)?.lifeState==='ALIVE'&&ui.hasRunResult){ui.clearRunResult();ui.showGame(ui.mode==='PRACTICE'?'PRACTICE':'ONLINE');}
 const previousMatchId=scene.view?.matchId,previous=scene.view?.participants.find(p=>p.participantId===selfId);
 if(ui.mode!=='PRACTICE'&&(init||ui.mode!=='ONLINE'))ui.showGame('ONLINE');
 scene.setView(view,selfId,ui.mode==='ONLINE',init);ui.updateView(view,selfId,init);rewards.observe(view,selfId);ui.clearMessage();const self=view.participants.find(p=>p.participantId===selfId)!;
 if(self.lifeState==='ALIVE'){runRetryPending=false;}
 const playable=!document.hidden&&!ui.isSettingsOpen()&&view.phase==='RUNNING'&&(ui.mode==='PRACTICE'||!!online?.hasCurrentState);
 if(playable&&(self.lifeState==='DEAD_WAIT'||self.lifeState==='SPAWN_BLOCKED'))input.suspendForRespawn();
 else input.enabled=playable&&self.lifeState==='ALIVE';
 if(self.lifeState==='ALIVE'&&(init||previous?.lifeId!==self.lifeId||previousMatchId!==view.matchId))input.setDirection(self.targetDirection??self.direction);
 if(input.enabled)input.resumeHeldTouch();
}
async function restartRun():Promise<void> {
 input.enabled=false;input.reset();
 if(practice){ui.setRunRetryAvailable(true);ui.clearRunResult();if(practice.match.phase==='RUNNING'&&practice.retryRun()){ui.showGame('PRACTICE');display(buildView(practice.match),practice.selfId);return;}await startPractice(practice.match.gameMode);return;}
 const view=scene.view,self=view?.participants.find(p=>p.participantId===scene.selfId);const result=ui.currentRunResult??self?.run?.result;if(!online||!result)return;
 runRetryPending=true;try{const response=await online.command('run:retry',{matchId:result.matchId,runId:result.runId});
  if(response.ok){ui.clearRunResult();if(online.view?.participants.find(p=>p.participantId===online?.selfId)?.lifeState==='ALIVE')display(online.view,online.selfId!);}else if(response.code==='ROOM_NOT_FOUND'){await enterOnline('room:quickJoin');}else{runRetryPending=false;ui.message(response.message);}
 }catch(error){runRetryPending=false;ui.message((error as Error).message,true);}
}
async function stopOnline():Promise<void> {
 const old=online;online=null;if(!old)return;
 try{await old.leave();}catch{clearSessionToken();}finally{old.dispose();}
}
async function startPractice(gameMode:GameModeConfig=createMode(ui.selectedGameMode())):Promise<void> {
 try{const nickname=ui.nickname();rewards.retire();input.enabled=false;input.reset();practice?.dispose();practice=null;await stopOnline();ui.clearMessage();ui.setRunRetryAvailable(true);ui.showGame('PRACTICE');
 const experimentParams=new URLSearchParams(location.search),experimentEnabled=import.meta.env.DEV||import.meta.env.MODE==='test',experiment={...experimentalMapConfig(experimentParams.get('experimentMapRadius'),experimentEnabled),...experimentalSlotConfig(experimentParams.get('experimentSlots'),experimentEnabled)},seed=experimentalSeed(experimentParams.get('experimentSeed'),experimentEnabled);
 practice=new PracticeSession(nickname,(v,id)=>display(v,id),experiment, {seed,gameMode,diagnostics:diagnosticsEnabled});input.setDirection(practice.match.participants[0].direction);}
 catch(error){ui.message((error as Error).message);}
}
function onRoom(view:RoomView):void {
 if(view.selfRunResult&&!runRetryPending&&(view.phase!=='RUNNING'||!online?.hasCurrentState)){ui.mode='ONLINE';ui.showRunResult(view.selfRunResult,true);void rewards.present(view.selfRunResult);input.enabled=false;return;}
 if(ui.hasRunResult&&!runRetryPending)return;
 if(view.phase!=='RUNNING'||online?.hasCurrentState)ui.clearMessage();
 if(view.waitingForNextRound||view.phase==='WAITING'||view.phase==='COUNTDOWN'){input.enabled=false;preview();ui.showRoom(view);}
 else if(view.phase==='RESULTS'&&view.results&&view.selfParticipantId){ui.mode='ONLINE';ui.showResults(view.matchId!,view.results,view.selfParticipantId,view.gameMode,view.outcome,view.mapCellCount);input.enabled=false;}
}
async function enterOnline(event:'room:quickJoin'|'room:create'|'room:join',code?:string,gameMode:GameModeId=ui.selectedGameMode()):Promise<void> {
 lastOnlineAction=()=>enterOnline(event,code,gameMode);let activeSession:NetworkSession|null=null;
 try{
  const nickname=ui.nickname();rewards.retire();input.enabled=false;input.reset();practice?.dispose();practice=null;await stopOnline();
  if(expired){clearSessionToken();expired=false;}
  ui.message('대전 서버에 연결하고 있어요.');
  const session=new NetworkSession({input:(direction,seq)=>scene.setLocalInput(direction,seq),room:onRoom,view:display,snapshot:raw=>{
if(import.meta.env.MODE==='test'){testHistory.push(raw);if(testHistory.length>512)testHistory.shift();}},error:error=>{expired=error.code==='SESSION_EXPIRED';input.enabled=false;scene.freezePresentation();ui.message(error.message,true);},connected:connected=>{ui.setRunRetryAvailable(connected);if(!connected){input.enabled=false;scene.freezePresentation();ui.message('연결을 복구하고 있어요.',true);}}});online=session;activeSession=session;
  await session.connect();if(online!==session)return;const response=await session.command(event,{nickname,...(code?{code}:{}),...(event!=='room:join'?{gameMode}:{})});if(!response.ok)ui.message(response.message,true);
 }catch(error){if(activeSession&&online!==activeSession)return;ui.message((error as Error).message||'서버에 연결할 수 없어요.',true);}
}
async function startOnline():Promise<void>{try{const response=await online?.command('room:start');if(response&&!response.ok)ui.message(response.message);}catch(error){ui.message((error as Error).message,true);}}
async function retryOnline():Promise<void>{await stopOnline();if(expired){clearSessionToken();expired=false;}if(lastOnlineAction)await lastOnlineAction();}
async function leave():Promise<void>{rewards.retire();haptics.stop();input.enabled=false;input.reset();practice?.dispose();practice=null;runRetryPending=false;await stopOnline();ui.clearMessage();ui.showMenu();preview();}
const invited=new URLSearchParams(location.search).get('room');if(invited){document.querySelector<HTMLInputElement>('#room-code')!.value=invited.toUpperCase();ui.message('초대받은 방 코드가 입력됐어요. 닉네임을 정하고 입장하세요.');}
ui.showMenu();preview();






document.addEventListener('visibilitychange',()=>{
 haptics.stop();input.reset();input.enabled=false;scene.freezePresentation();practice?.setPaused(document.hidden||ui.isSettingsOpen());
 if(online)void online.setBackground(document.hidden).catch(error=>ui.message((error as Error).message,true));
 else if(practice&&!document.hidden)display(buildView(practice.match),practice.selfId,true);
});


startFrameMeter();

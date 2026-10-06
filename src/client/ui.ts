import type {MatchView,ResultRow,MatchOutcome,RunResult} from '../shared/model.js';
import {createMode,GAME_MODES,territoryPercent,type GameModeConfig,type GameModeId} from '../shared/modes.js';
import {normalizeNickname} from '../shared/names.js';
import {SLOT_COLORS} from './player-colors.js';
import {SettingsStore} from './settings.js';
import {browserHaptics} from './haptics.js';
import type {RewardReceipt} from './profile.js';
import {deathMessage} from './death-message.js';
const showDeathDiagnostic=new URLSearchParams(location.search).get('debug')==='1';
export interface UIActions { rewardRetry?:()=>void;  practice:()=>void; leave:()=>void; restart:()=>void; quick?:()=>void; create?:()=>void; join?:(code:string)=>void; start?:()=>void; retry?:()=>void; settingsOpen?:(open:boolean)=>void; testVibration?:()=>boolean }
export interface RoomDisplay {
 roomId:string;code:string|null;mode:'PUBLIC'|'FRIEND';phase:string;phaseDeadline:number|null;
 members:{memberId:string;nickname:string;connected:boolean;waitingForNextRound:boolean}[];
 hostId:string|null;selfMemberId:string;waitingForNextRound:boolean;remainingSeconds:number|null;gameMode:GameModeConfig;
}
const get=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
function stored(key:string):string|null{try{return localStorage.getItem(key);}catch{return null;}}
function save(key:string,value:string):void{try{localStorage.setItem(key,value);}catch{}}
const peopleIcon='<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="11" cy="9" r="5" fill="currentColor"/><circle cx="24" cy="12" r="4" fill="currentColor"/><path d="M1 29v-5a10 10 0 0 1 20 0v5ZM23 29v-5a13 13 0 0 0-2-7 8 8 0 0 1 10 8v4Z" fill="currentColor"/></svg>';
export class UI {
 mode:'MENU'|'PRACTICE'|'ONLINE'='MENU';private pending:(()=>void)|null=null;private resultId='';private boardKey='';
 private activeMode:GameModeConfig=createMode();private totalCells=1;
 currentRunResult:RunResult|null=null;private runKey='';private runTimer:ReturnType<typeof setTimeout>|null=null;
 private controlsActive=false;
 private noticeUntil=0;
 constructor(private actions:UIActions,private settings=new SettingsStore()){
  get('app').innerHTML=`<div id="field"></div><div class="menu-art" aria-hidden="true"><i></i><i></i><i></i></div>
<header class="brand"><span class="brand-mark" aria-hidden="true"></span> HEXHOLD <small id="menu-coins">Coins · …</small><button id="shop-open" class="quiet" aria-haspopup="dialog">상점</button><button id="profile-open" class="quiet" aria-haspopup="dialog">프로필</button></header>
<div class="header-line" aria-hidden="true"></div><button id="rules" class="rules-button">게임 방법 ↗</button><button id="settings" class="quiet" aria-label="환경설정" title="환경설정">⚙</button>
<canvas id="minimap" width="240" height="204" aria-label="전체 영토 지도" hidden></canvas>
<section id="menu" class="panel menu-panel">
 <div class="hero"><div><h1 aria-label="HEXHOLD">HEXH<span class="hero-hex" aria-hidden="true"></span>LD</h1><p class="tagline">선을 그려, 내 세상을 넓혀.</p></div>
 <p class="landscape-copy">가로 화면으로 더 넓게 플레이</p></div>
 <div class="mode-selector" aria-label="게임 모드"><div id="mode-slide"><strong id="mode-name">CLASSIC</strong><span id="mode-subtitle">완전 점령</span><p id="mode-description">맵 전체를 자신의 영토로 만들면 승리</p><small id="mode-rule">100% 점령</small></div></div>
 <div class="nickname-row"><label class="field-label" for="nickname">닉네임</label><div class="nickname-input">
 <input id="nickname" data-testid="nickname" maxlength="128" autocomplete="nickname" aria-describedby="nickname-hint" placeholder="닉네임 입력">
 <small id="nickname-hint">1–16자 · 다음 판에도 이 이름으로</small></div></div>
 <div class="play-actions"><button id="quick" data-testid="quick" class="mode-card play-card"><span class="mode-label"><i class="small-hex" aria-hidden="true"></i> PLAY</span><strong>공개 대전</strong><span class="mode-description">사람과 봇이 함께하는 영역 전쟁</span><span class="mode-arrow" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M12 52 52 12M16 12h36v36"/></svg></span></button><button id="practice" data-testid="practice" class="mode-card practice-card"><span class="mode-label"><i class="practice-icon" aria-hidden="true"></i> SOLO</span><strong>싱글 플레이</strong><span class="mode-description">한 번의 생존, 하나의 Run</span><span class="mode-arrow practice-icon" aria-hidden="true"></span></button></div>
 <div class="friend-actions"><div class="friend-copy">${peopleIcon}<div><h2>친구와 함께</h2><p>방을 만들거나 코드로 참여하세요</p></div></div><button id="create" data-testid="create" class="dark-button">방 만들기</button><input id="room-code" data-testid="room-code" maxlength="8" placeholder="방 코드" aria-label="친구 방 코드"><button id="join" data-testid="join" class="quiet">입장</button></div>
 <p class="menu-footer"><span aria-hidden="true">◆</span> 내 땅으로 돌아오면 점령. 상대의 선을 끊으면 탈락.</p>
</section>
<div id="hud" hidden><div class="score-block"><small>내 점유율</small><strong id="score" data-testid="score"></strong><span class="personal-stats"><b id="self-rank">1위</b><span>처치 <b id="kill-count">0</b></span></span></div><button id="game-tools-toggle" class="quiet" aria-label="경기 메뉴" aria-controls="game-tools" aria-expanded="false">☰</button><button id="leave" data-testid="leave" class="quiet" aria-label="나가기" title="나가기">↪</button></div>
<section id="game-tools" aria-label="경기 메뉴" hidden><button id="ranking-toggle" class="quiet" aria-controls="leaderboard" aria-pressed="false">전체 순위</button><button id="map-toggle" class="quiet" aria-controls="minimap" aria-pressed="false">미니맵</button><button id="fullscreen-toggle" class="quiet">가로 전체 화면</button><p id="score-detail"></p><p class="tools-hint">PC: WASD / 마우스<br>모바일: 설정에서 조작 선택</p></section>
<aside id="leaderboard" hidden><div class="board-title">전체 순위 <button id="ranking-close" class="text-button" aria-label="순위 닫기">✕</button><small id="population"></small></div><ol id="ranking"></ol></aside>
<div id="rotate-hint" role="status" hidden><span aria-hidden="true">↻</span> 가로로 돌리면 전장이 넓어져요</div>
<div id="control-hint" hidden><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> / 방향키 · 마우스로 방향 지정</div>
<div id="death" data-testid="death" role="status" hidden></div>
<section id="room-panel" class="panel room-panel" hidden><div class="eyebrow">LOBBY</div><h2 id="room-title"></h2><p id="room-game-mode"></p><p id="room-status"></p><div id="invite"><strong id="friend-code"></strong><button id="copy-link" class="quiet">초대 링크 복사</button></div><ul id="members"></ul><button id="start" data-testid="start" class="primary">라운드 시작 →</button><button id="room-leave" class="quiet">나가기</button></section>
<section id="results" class="panel results-panel" hidden><div class="eyebrow" id="result-mode">ROUND COMPLETE</div><h2 id="winner-result">이번 판의 영역 기록</h2><p id="personal-result"></p><div class="table-scroll"><table><thead><tr><th>순위 · 참가자</th><th>점유율</th><th>영토 칸</th><th>처치 / 사망</th></tr></thead><tbody id="result-rows"></tbody></table></div><div class="menu-actions"><button id="restart" data-testid="restart" class="primary">다시 연습 →</button><button id="result-leave" class="quiet">나가기</button></div><small id="next-round"></small></section>
<div id="run-results" hidden><section class="run-panel" role="dialog" aria-modal="true" aria-labelledby="run-title"><div class="eyebrow">YOUR RUN</div><h2 id="run-title">RUN OVER</h2><p id="run-reason"></p><div class="run-stats"><div><small>최고 점유율</small><strong id="run-best"></strong></div><div><small>플레이 시간</small><strong id="run-time"></strong></div><div><small>처치</small><strong id="run-kills"></strong></div></div><div class="run-reward"><strong id="run-coins">…</strong><span id="run-balance">보상 저장 중</span><button id="reward-retry" class="text-button" hidden>저장 재시도</button></div><div class="run-actions"><button id="run-retry" class="primary">다시 하기 →</button><button id="run-menu" class="quiet">메인 메뉴</button></div></section></div>\n<dialog id="tutorial"><div class="eyebrow">HOW TO PLAY</div><h2>세 가지만 기억하세요.</h2><div class="rule-grid">
 <article><div class="rule-picture">⬢ <span>⬡ ⬡</span> ⬢</div><h3>01. 돌아와야 내 땅</h3><p>내 땅 밖에 선을 그린 뒤<br>내 영토로 돌아오면 점령합니다.</p></article>
 <article><div class="rule-picture danger">⬡ ⬡ <b>✕</b> ⬡</div><h3>02. 선과 벽을 조심하세요</h3><p>상대가 내 선을 끊거나<br>외곽 벽에 부딪치면 탈락합니다.</p></article>
 <article><div class="rule-picture point">⬢ <span>100%</span></div><h3 id="tutorial-mode-title">03. 완전 점령</h3><p id="tutorial-mode-description">맵 전체를 자신의 영토로 만들면 승리</p></article></div>
 <p class="tutorial-control">WASD / 방향키 · 마우스 방향 지정 · 모바일 조이스틱 / 화면 드래그 (환경설정)</p><div class="menu-actions"><button id="tutorial-go" class="primary">이해했어요 →</button><button id="tutorial-skip" data-testid="tutorial-skip" class="quiet">건너뛰기</button></div></dialog>
<dialog id="settings-dialog" aria-labelledby="settings-title"><div class="eyebrow">SETTINGS</div><h2 id="settings-title">환경설정</h2><fieldset class="control-options"><legend>모바일 조작 방법</legend><label><input type="radio" name="mobile-controls" id="controls-joystick" value="joystick"><span><b>조이스틱</b><small>왼쪽 아래 스틱으로 방향을 정해요.</small></span></label><label><input type="radio" name="mobile-controls" id="controls-drag" value="drag"><span><b>화면 드래그</b><small>전장의 빈 곳에서 손가락을 밀어 원하는 방향을 정해요.</small></span></label><label><input type="radio" name="mobile-controls" id="controls-trackpad" value="trackpad"><span><b>PC식 트랙패드</b><small>손가락 이동으로 가상 마우스를 움직여 PC 조작처럼 방향을 정해요.</small></span></label></fieldset><p class="settings-help">손을 떼면 마지막 방향으로 계속 이동합니다.<br>버튼과 정보 카드 위에서는 드래그가 시작되지 않아요.</p><label class="vibration-option"><input type="checkbox" id="kill-vibration"><span><b>전투 진동</b><small>처치하면 짧게, 탈락하면 길게 진동해요.</small></span></label><p id="vibration-support" class="settings-help"></p><button id="vibration-test" class="quiet">진동 테스트</button><p class="settings-help">설정은 이 브라우저에 자동 저장됩니다.<br>온라인 대전은 설정을 여는 동안에도 계속됩니다.</p><button id="settings-close" class="primary">완료 →</button><p id="vibration-status" role="status" class="settings-help"></p></dialog>
<div id="notice" role="alert" hidden><p id="notice-text"></p><div id="notice-actions" hidden><button id="retry" class="quiet">재시도</button><button id="fallback-practice" class="quiet">봇 연습</button></div><button id="notice-close" aria-label="안내 닫기" class="text-button">✕</button></div>
<div id="joystick" aria-label="방향 조이스틱" hidden><div id="joystick-thumb"></div></div>`;
  get<HTMLInputElement>('nickname').value=stored('hexhold.nickname')??'플레이어';
  const bind=(id:string,action:()=>void)=>get(id).addEventListener('click',action);
  bind('game-tools-toggle',()=>{const open=get('game-tools').hidden;get('game-tools').hidden=!open;get('game-tools-toggle').setAttribute('aria-expanded',String(open));});
  bind('ranking-toggle',()=>this.togglePanel('leaderboard','ranking-toggle'));
  bind('ranking-close',()=>{get('leaderboard').hidden=true;get('ranking-toggle').setAttribute('aria-pressed','false');get('game-tools-toggle').focus();});
  bind('map-toggle',()=>this.togglePanel('minimap','map-toggle'));
  bind('fullscreen-toggle',()=>void this.landscapeFullscreen());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!this.isSettingsOpen()&&!get<HTMLDialogElement>('tutorial').open){this.closeGamePanels();}});
  bind('settings',()=>{get('vibration-status').textContent='';get<HTMLDialogElement>('settings-dialog').showModal();this.actions.settingsOpen?.(true);this.refreshSettings();});
  bind('settings-close',()=>get<HTMLDialogElement>('settings-dialog').close());
  get('settings-dialog').addEventListener('close',()=>{this.actions.settingsOpen?.(false);this.refreshControls();});
  for(const mode of ['joystick','drag','trackpad'] as const)get('controls-'+mode).addEventListener('change',()=>this.settings.update({mobileControls:mode}));
  get('kill-vibration').addEventListener('change',()=>this.settings.update({killVibration:get<HTMLInputElement>('kill-vibration').checked}));
  bind('vibration-test',()=>{get('vibration-status').textContent=this.actions.testVibration?.()?'진동을 요청했어요. 무음 설정이나 기기에 따라 느껴지지 않을 수 있어요.':'이 환경에서는 진동을 실행할 수 없어요.';});
  this.settings.subscribe(()=>this.refreshSettings());this.refreshSettings();
  bind('practice',()=>this.requestPlay(this.actions.practice));bind('quick',()=>this.requestPlay(()=>this.actions.quick?this.actions.quick():this.message('온라인 연결을 준비하고 있어요.')));
  bind('create',()=>this.requestPlay(()=>this.actions.create?this.actions.create():this.message('온라인 연결을 준비하고 있어요.')));
  bind('join',()=>this.requestPlay(()=>this.actions.join?this.actions.join(get<HTMLInputElement>('room-code').value.trim().toUpperCase()):this.message('온라인 연결을 준비하고 있어요.')));
  bind('leave',this.actions.leave);bind('room-leave',this.actions.leave);bind('result-leave',this.actions.leave);bind('restart',this.actions.restart);
  bind('reward-retry',()=>this.actions.rewardRetry?.());bind('run-retry',this.actions.restart);bind('run-menu',this.actions.leave);
  bind('start',()=>this.actions.start?.());bind('rules',()=>this.tutorial(null));bind('tutorial-go',()=>this.closeTutorial());bind('tutorial-skip',()=>this.closeTutorial());
  bind('notice-close',()=>get('notice').hidden=true);bind('retry',()=>this.actions.retry?.());bind('fallback-practice',()=>{get('notice').hidden=true;this.requestPlay(this.actions.practice);});
  get<HTMLDialogElement>('tutorial').addEventListener('cancel',event=>{event.preventDefault();this.closeTutorial();});
  bind('copy-link',()=>{const code=get('friend-code').textContent??'';(navigator.clipboard?.writeText(location.origin+'/?room='+encodeURIComponent(code))??Promise.reject(new Error('Clipboard unavailable'))).then(()=>this.message('초대 링크를 복사했어요.')).catch(()=>this.message('복사가 막혔어요. 이 링크를 직접 공유하세요: '+location.origin+'/?room='+encodeURIComponent(code)));});
 }
 selectedGameMode():GameModeId{return 'classic';}
 private togglePanel(panel:string,button:string):void{const open=get(panel).hidden;this.closeGamePanels();get(panel).hidden=!open;get(button).setAttribute('aria-pressed',String(open));}
 private closeGamePanels():void{for(const id of ['game-tools','leaderboard','minimap'])get(id).hidden=true;get('game-tools-toggle').setAttribute('aria-expanded','false');for(const id of ['ranking-toggle','map-toggle'])get(id).setAttribute('aria-pressed','false');}
 private async landscapeFullscreen():Promise<void>{
  try{
   if(!document.fullscreenElement)await get('app').requestFullscreen();
   const orientation=screen.orientation as ScreenOrientation&{lock?:(orientation:string)=>Promise<void>};
   if(orientation.lock){try{await orientation.lock('landscape');}catch{this.message('기기를 가로로 돌려 플레이하세요.',false,5000);}}
   else if(matchMedia('(orientation:portrait)').matches)this.message('기기를 가로로 돌려 플레이하세요.',false,5000);
  }catch{this.message('기기를 가로로 돌려 플레이하세요. 이 브라우저에서는 전체 화면을 지원하지 않아요.',false,5000);}
  get('game-tools').hidden=true;get('game-tools-toggle').setAttribute('aria-expanded','false');
 }
 isSettingsOpen():boolean{return get<HTMLDialogElement>('settings-dialog').open;}
 private refreshSettings():void{
  const settings=this.settings.get();get<HTMLInputElement>('controls-'+settings.mobileControls).checked=true;get<HTMLInputElement>('kill-vibration').checked=settings.killVibration;
  const supported=browserHaptics().supported();get('vibration-support').textContent=supported?'지원되는 모바일 브라우저에서 동작합니다.':'현재 환경에서는 진동을 지원하지 않습니다.';
  get<HTMLButtonElement>('vibration-test').disabled=!supported||!settings.killVibration;this.refreshControls();
 }
 private refreshControls():void{get('joystick').hidden=!this.controlsActive||this.isSettingsOpen()||!matchMedia('(pointer:coarse)').matches||this.settings.get().mobileControls!=='joystick';}
 nickname():string {const name=normalizeNickname(get<HTMLInputElement>('nickname').value);if(!name)throw new Error('닉네임은 공백 정리 후 1–16자로 입력하세요.');save('hexhold.nickname',name);return name;}
 private requestPlay(action:()=>void):void {try{this.nickname();if(stored('hexhold.tutorialSeen')!=='1')this.tutorial(action);else action();}catch(error){this.message((error as Error).message);}}
 private tutorial(action:(()=>void)|null):void {this.pending=action;const mode=this.mode==='MENU'?createMode():this.activeMode;get('tutorial-mode-title').textContent='03. '+GAME_MODES[mode.id].subtitle;get('tutorial-mode-description').textContent=GAME_MODES[mode.id].description+' · '+GAME_MODES[mode.id].rules(mode);get<HTMLDialogElement>('tutorial').showModal();}
 private closeTutorial():void {get<HTMLDialogElement>('tutorial').close();save('hexhold.tutorialSeen','1');const action=this.pending;this.pending=null;action?.();}
 showMenu():void {
  this.controlsActive=false;
  this.clearRunResult();this.mode='MENU';get('app').dataset.screen='menu';this.resultId='';get('menu').hidden=false;
  this.closeGamePanels();for(const id of ['hud','rotate-hint','control-hint','death','results','room-panel','joystick'])get(id).hidden=true;
  screen.orientation?.unlock?.();
 }
 showGame(mode:'PRACTICE'|'ONLINE'):void {
  this.mode=mode;get('app').dataset.screen='game';get('menu').hidden=true;get('room-panel').hidden=true;get('results').hidden=true;
  this.closeGamePanels();get('hud').hidden=false;get('rotate-hint').hidden=false;get('control-hint').hidden=true;
  this.controlsActive=true;this.refreshControls();
 }
 updateView(view:MatchView,selfId:string,init=false,colors:readonly number[]=SLOT_COLORS):void {
  const self=view.participants.find(p=>p.participantId===selfId);if(!self)return;
  this.controlsActive=view.phase==='RUNNING'&&self.lifeState==='ALIVE';this.refreshControls();get('joystick').classList.toggle('respawn-paused',self.lifeState!=='ALIVE');
  this.activeMode=view.gameMode;this.totalCells=view.owners.length;
  get('hud').dataset.matchId=view.matchId;get('hud').dataset.selfId=selfId;get('hud').dataset.lifeId=String(self.lifeId);get('hud').dataset.tick=String(view.tick);
  get('score').textContent=territoryPercent(self.territoryCount,this.totalCells).toFixed(1)+'%';get('score-detail').textContent='영토 '+self.territoryCount+' / '+this.totalCells+'칸';
  get('kill-count').textContent=String(self.run?Math.max(0,self.kills-self.run.initialKills):self.kills);
  get('population').textContent=view.participants.filter(p=>p.kind==='HUMAN').length+' HUMAN · '+view.participants.filter(p=>p.kind==='BOT').length+' BOT';
  const ordered=[...view.participants].sort((a,b)=>b.territoryCount-a.territoryCount||b.kills-a.kills);
  const key=JSON.stringify([colors,selfId,this.totalCells,view.gameMode.id,ordered.map(p=>[p.participantId,p.nickname,p.kind,p.slot,p.territoryCount,p.kills])]);
  if(key!==this.boardKey){this.boardKey=key;const list=get('ranking');list.replaceChildren();let rank=0;
   ordered.forEach((p,i)=>{const previous=ordered[i-1];if(!previous||p.territoryCount!==previous.territoryCount||p.kills!==previous.kills)rank=i+1;
    const row=document.createElement('li');if(p.participantId===selfId){row.className='self';get('self-rank').textContent=rank+'위';}
    const number=document.createElement('span');number.className='rank-number';number.textContent=String(rank);
    const name=document.createElement('span');name.className='rank-name';name.textContent=p.nickname;name.style.borderColor='#'+colors[p.slot].toString(16).padStart(6,'0');
    if(p.kind==='BOT'){const bot=document.createElement('small');bot.textContent='BOT';name.append(bot);}
    const score=document.createElement('b'),percent=document.createElement('span'),kills=document.createElement('small');percent.className='rank-percent';percent.textContent=territoryPercent(p.territoryCount,this.totalCells).toFixed(1)+'%';kills.className='rank-kills';kills.textContent='처치 '+p.kills;score.append(percent,kills);row.append(number,name,score);list.append(row);
   });
  }
  const death=get('death');death.hidden=self.lifeState==='ALIVE'||view.phase!=='RUNNING'||this.hasRunResult;
  death.textContent=self.lifeState==='SPAWN_BLOCKED'?'안전한 '+(1+3*view.config.spawnRadius*(view.config.spawnRadius+1))+'칸을 찾고 있어요.':self.lifeState==='ELIMINATED'?deathMessage(self.deathReason,self.deathContext):'시작 위치를 준비하고 있어요.';
  if(self.run?.result&&self.lifeState!=='SPAWN_BLOCKED'&&self.lifeState!=='DEAD_WAIT')this.showRunResult(self.run.result,init);
  else if(self.lifeState==='ALIVE')this.clearRunResult();
  else if(view.phase==='FINISHED'&&!self.run)this.showResults(view.matchId,view.results??[],selfId,view.gameMode,view.outcome,view.owners.length);
 }
 setProfileBalance(coins:number|null):void {get('menu-coins').textContent=coins===null?'Coins · 저장 불가':'Coins · '+coins.toLocaleString();}
 showReward(runId:string,receipt:RewardReceipt):void {if(this.runKey!==runId)return;const amount=receipt.reward?.totalCoins;get('run-coins').textContent=amount!==undefined?'+'+amount.toLocaleString()+' Coins':receipt.status==='failed'?'저장 실패':'지급 내역 없음';get('run-balance').textContent=receipt.status==='failed'?'보상을 저장하지 못했어요':receipt.reward?'보유 '+receipt.balance.toLocaleString()+' Coins':'다시 지급하지 않았어요';get('reward-retry').hidden=receipt.status!=='failed';}
 setRunRetryAvailable(available:boolean):void {get<HTMLButtonElement>('run-retry').disabled=!available;}
 get hasRunResult():boolean{return !!this.runKey;}
 clearRunResult():void {if(this.runTimer!==null)clearTimeout(this.runTimer);this.runTimer=null;this.runKey='';this.currentRunResult=null;get('run-results').hidden=true;}
 showRunResult(result:RunResult,restored=false):void {
  if(this.runKey===result.runId)return;this.clearRunResult();this.runKey=result.runId;this.currentRunResult=result;get('run-coins').textContent='…';get('run-balance').textContent='보상 저장 중';get('reward-retry').hidden=true;this.controlsActive=false;this.refreshControls();
  const show=()=>{if(this.runKey!==result.runId)return;this.runTimer=null;get('run-title').textContent=result.endReason==='FULL_CAPTURE_WIN'?'CLASSIC CLEAR!':'RUN OVER';
   get('run-reason').textContent=result.endReason==='DEATH'?'이번 생존의 기록':result.endReason==='FULL_CAPTURE_LOSS'?'다른 참가자가 100%를 달성했습니다.':'월드 전체를 점령했습니다.';
   get('run-best').textContent=result.bestTerritoryPercent.toFixed(1)+'%';const seconds=Math.floor(result.durationTicks/result.simulationHz);get('run-time').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');get('run-kills').textContent=String(result.kills);
   this.closeGamePanels();get('results').hidden=true;get('death').hidden=true;get('joystick').hidden=true;get('hud').hidden=true;get('rotate-hint').hidden=true;get('run-results').hidden=false;get('run-retry').focus();
  };
  if(result.endReason==='DEATH'&&!restored)this.runTimer=setTimeout(show,700);else show();
 }
 showResults(matchId:string,rows:ResultRow[],selfId:string,mode=this.activeMode,outcome:MatchOutcome|null=null,totalCells=this.totalCells):void {
  this.controlsActive=false;
  this.activeMode=mode;this.totalCells=totalCells;
  get('app').dataset.screen='game';get('menu').hidden=true;get('room-panel').hidden=true;
  get('results').hidden=false;get('death').hidden=true;get('joystick').hidden=true;
  this.closeGamePanels();get('hud').hidden=true;get('rotate-hint').hidden=true;
  if(this.resultId===matchId)return;this.resultId=matchId;
  const self=rows.find(p=>p.participantId===selfId),winner=rows.find(p=>p.participantId===outcome?.winnerId);get('result-mode').textContent=GAME_MODES[mode.id].name+' · '+GAME_MODES[mode.id].rules(mode);get('winner-result').textContent=winner?winner.nickname+' 승리!':'이번 판의 영역 기록';get('personal-result').textContent=self?'내 순위 '+(self.rank??'LEFT')+' · '+territoryPercent(self.territory,totalCells).toFixed(1)+'% · 처치 '+self.kills:'경기가 종료되었습니다.';
  get('result-rows').replaceChildren();
  for(const row of rows){const tr=document.createElement('tr');if(row.participantId===selfId)tr.className='self';
   for(const value of [(row.rank??'LEFT')+' · '+row.nickname+(row.kind==='BOT'?' [BOT]':''),territoryPercent(row.territory,totalCells).toFixed(1)+'%',row.territory,row.kills+' / '+row.deaths]){
    const td=document.createElement('td');td.textContent=String(value);tr.append(td);
   }get('result-rows').append(tr);
  }
  get('restart').textContent=this.mode==='ONLINE'?'다음 판 참가 ✓':'다시 연습 →';
  get('next-round').textContent=this.mode==='ONLINE'?'방에 남아 있으면 결과 7초 뒤 다음 카운트다운이 시작됩니다.':'연습은 직접 재시작할 수 있어요.';
 }
 showRoom(view:RoomDisplay):void {
  this.controlsActive=false;
  this.mode='ONLINE';get('app').dataset.screen='room';get('menu').hidden=true;get('hud').hidden=true;get('leaderboard').hidden=true;get('minimap').hidden=true;get('results').hidden=true;get('room-panel').hidden=false;
  this.closeGamePanels();for(const id of ['control-hint','rotate-hint','joystick','death'])get(id).hidden=true;
  get('room-title').textContent=view.mode==='FRIEND'?'친구와 같은 판에서.':'상대를 모으고 있어요.';
  this.activeMode=view.gameMode;get('room-game-mode').textContent=GAME_MODES[view.gameMode.id].name+' · '+GAME_MODES[view.gameMode.id].rules(view.gameMode);
  get('room-status').textContent=view.waitingForNextRound?'현재 경기 진행 중 · 다음 라운드 참가 대기':view.phase==='COUNTDOWN'?Math.ceil(view.remainingSeconds??0)+'초 후 시작합니다.':view.mode==='PUBLIC'?'빈자리는 봇이 채웁니다. 5초 안에 출발!':'부족한 인원은 봇으로 채웁니다.';
  get('invite').hidden=view.mode!=='FRIEND';get('friend-code').textContent=view.code??'';
  get('members').replaceChildren();for(const member of view.members){const li=document.createElement('li');li.textContent=member.nickname+(member.memberId===view.hostId?' · 방장':'')+(!member.connected?' · 복구 대기':'')+(member.waitingForNextRound?' · 다음 판':'');get('members').append(li);}
  get('start').hidden=!(view.mode==='FRIEND'&&view.phase==='WAITING'&&view.hostId===view.selfMemberId);
 }
 clearMessage():void {if(performance.now()>=this.noticeUntil)get('notice').hidden=true;}
 message(text:string,recovery=false,holdMs=0):void {this.noticeUntil=performance.now()+holdMs;get('notice').hidden=false;get('notice-text').textContent=text;get('notice-actions').hidden=!recovery;}
}




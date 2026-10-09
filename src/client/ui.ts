import type {MatchView,ResultRow,MatchOutcome,RunResult} from '../shared/model.js';
import {createMode,GAME_MODES,territoryPercent,type GameModeConfig,type GameModeId} from '../shared/modes.js';
import {normalizeNickname} from '../shared/names.js';
import {SLOT_COLORS} from './player-colors.js';
import {SettingsStore,type ColorStyle} from './settings.js';
import {browserHaptics} from './haptics.js';
import type {RewardReceipt} from './profile.js';
import {deathMessage} from './death-message.js';
import {ICONS} from './icons.js';
import {cssHex} from './theme.js';
import {markerPreview,type MarkerAppearance} from './marker-art.js';
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
// Mode names stay English in shared code; the client shows Korean labels.
const MODE_LABELS:Partial<Record<GameModeId,string>>={classic:'클래식'};
export const modeLabel=(mode:GameModeConfig)=>(MODE_LABELS[mode.id]??GAME_MODES[mode.id].name)+' · '+GAME_MODES[mode.id].rules(mode);
// Under 1% a gain needs two decimals or small captures all read as +0.1%.
export const gainLabel=(percent:number)=>'+'+(percent<1?percent.toFixed(2):percent.toFixed(1))+'%';
const iconButton=(id:string,label:string,icon:string,extra='')=>`<button id="${id}" class="btn icon" aria-label="${label}" data-label="${label}" ${extra}>${icon}</button>`;
export class UI {
 mode:'MENU'|'PRACTICE'|'ONLINE'='MENU';private pending:(()=>void)|null=null;private resultId='';private boardKey='';
 private activeMode:GameModeConfig=createMode();private totalCells=1;
 currentRunResult:RunResult|null=null;private runKey='';private runTimer:ReturnType<typeof setTimeout>|null=null;
 private controlsActive=false;
 private noticeUntil=0;
 private toastLife='';private toastCells=0;private toastTimer:ReturnType<typeof setTimeout>|null=null;private deathText='';
 constructor(private actions:UIActions,private settings=new SettingsStore()){
  get('app').innerHTML=`<div id="field"></div><div class="menu-art" aria-hidden="true"></div>
<header class="brand"><h1 aria-label="HEXHOLD">HEXHOLD</h1><p class="tagline">긋고, 돌아와, 차지해.</p></header>
<nav class="top-actions" aria-label="메뉴"><span class="coin-pill">${ICONS.coin}<b id="menu-coins">…</b></span>${iconButton('shop-open','상점',ICONS.bag,'aria-haspopup="dialog"')}${iconButton('profile-open','프로필',ICONS.user,'aria-haspopup="dialog"')}${iconButton('rules','게임 방법',ICONS.help)}</nav>
${iconButton('settings','설정',ICONS.gear,'title="설정"')}
<canvas id="minimap" width="240" height="208" aria-label="전체 영토 지도" hidden></canvas>
<section id="menu" class="menu-panel">
 <div class="home-stage"><img class="home-art" src="/assets/ui/home-art.svg" alt=""><span id="home-marker" class="home-marker" aria-hidden="true"></span></div>
 <div class="play-column">
  <label class="nickname-row"><span class="field-label">닉네임</span><input id="nickname" data-testid="nickname" maxlength="128" autocomplete="nickname" aria-describedby="nickname-hint" placeholder="닉네임 입력">${ICONS.pencil}</label>
  <small id="nickname-hint" class="sr-only">1–16자 · 다음 판에도 이 이름으로</small>
  <button id="practice" data-testid="practice" class="btn play-main"><span class="play-text"><strong>싱글 플레이</strong><span class="mode-line">봇과 함께 · <span id="mode-name">클래식</span> <span id="mode-subtitle">100% 점령</span></span></span><span class="play-icon">${ICONS.play}</span></button>
  <section class="friend-card" aria-labelledby="friend-title"><div class="friend-head"><h2 id="friend-title">친구와 함께</h2><span>방을 만들거나 코드로 들어가요</span></div>
   <div class="friend-actions"><button id="create" data-testid="create" class="btn dark">${ICONS.plus}방 만들기</button><label class="code-field"><span class="sr-only">친구 방 코드</span><input id="room-code" data-testid="room-code" maxlength="8" placeholder="방 코드"><button id="join" data-testid="join" class="btn mini sun">입장</button></label></div></section>
 </div>
 <p class="menu-footer">내 땅에서 나가 선을 긋고, 돌아오면 점령!</p>
</section>
<div id="hud" hidden>
 <section class="score-block" aria-label="내 기록과 순위">
  <div class="score-head"><div><small>점유율</small><span class="score-wrap"><strong id="score" data-testid="score"></strong><output id="capture-toast" aria-live="polite" hidden></output></span></div><span class="kills">${ICONS.swords}처치 <b id="kill-count">0</b></span></div>
  <ol id="mini-board" aria-label="순위"></ol>
 </section>
 ${iconButton('game-tools-toggle','경기 메뉴',ICONS.menu,'aria-controls="game-tools" aria-expanded="false"')}
</div>
<section id="game-tools" aria-label="경기 메뉴" hidden><button id="ranking-toggle" class="menu-item" aria-controls="leaderboard" aria-pressed="false">${ICONS.trophy}전체 순위</button><button id="fullscreen-toggle" class="menu-item">${ICONS.expand}가로 전체 화면</button><p id="score-detail"></p><hr><button id="leave-request" class="menu-item danger">${ICONS.exit}나가기</button></section>
<section id="leave-confirm" role="alertdialog" aria-labelledby="leave-title" aria-describedby="leave-copy" hidden><h2 id="leave-title">이번 판에서 나갈까요?</h2><p id="leave-copy">나가면 지금 판은 여기서 끝나요.</p><div class="row"><button id="leave-cancel" class="btn sun">계속하기</button><button id="leave" data-testid="leave" class="btn danger">나가기</button></div></section>
<aside id="leaderboard" hidden><div class="board-title">전체 순위 <button id="ranking-close" class="btn icon small" aria-label="순위 닫기">${ICONS.close}</button><small id="population"></small></div><ol id="ranking"></ol></aside>
<div id="rotate-hint" role="status" hidden><span aria-hidden="true">↻</span> 가로로 돌리면 전장이 넓어져요</div>
<div id="control-hint" hidden><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> / 방향키 · 마우스로 방향 지정</div>
<div id="death" data-testid="death" role="status" hidden></div>
<section id="room-panel" class="room-panel" hidden>
 <button id="room-leave" class="btn back">${ICONS.back}나가기</button>
 <div class="room-info"><p class="eyebrow" id="room-kind">친구 방</p><h2 id="room-title"></h2><div id="invite"><strong id="friend-code" aria-label="방 코드"></strong><button id="copy-link" class="btn">${ICONS.copy}초대 링크 복사</button></div><p id="room-game-mode"></p></div>
 <div class="room-members card"><div class="members-head"><h3>참가자</h3><p id="room-status"></p></div><ul id="members"></ul><button id="start" data-testid="start" class="btn sun big">라운드 시작 ${ICONS.play}</button></div>
</section>
<section id="results" class="card results-panel" hidden><p class="eyebrow" id="result-mode">판 종료</p><h2 id="winner-result">이번 판의 영역 기록</h2><p id="personal-result"></p><div class="table-scroll"><table><thead><tr><th>순위 · 참가자</th><th>점유율</th><th>영토 칸</th><th>처치 / 사망</th></tr></thead><tbody id="result-rows"></tbody></table></div><div class="menu-actions"><button id="restart" data-testid="restart" class="btn sun">다시 연습</button><button id="result-leave" class="btn">나가기</button></div><small id="next-round"></small></section>
<div id="run-results" hidden><section class="run-panel card" role="dialog" aria-modal="true" aria-labelledby="run-title">
 <div class="run-head"><svg class="run-badge" viewBox="0 0 70 70" aria-hidden="true"><polygon class="badge-side" points="35,8 64,24 64,54 35,70 6,54 6,24"/><polygon class="badge-top" points="35,3 64,19 64,49 35,65 6,49 6,19"/><path class="glyph death" d="M25 24l20 20M45 24 25 44"/><path class="glyph win" d="M22 42l-2-16 9 7 6-11 6 11 9-7-2 16Z"/><path class="glyph loss" d="M27 46V22h16l-3 6 3 6H27"/></svg><div><h2 id="run-title">탈락!</h2><p id="run-reason"></p></div></div>
 <div class="run-stats"><div><small>최고 점유율</small><strong id="run-best"></strong></div><div><small>생존 시간</small><strong id="run-time"></strong></div><div><small>처치</small><strong id="run-kills"></strong></div></div>
 <div class="run-reward">${ICONS.coin}<strong id="run-coins">…</strong><span class="reward-label">코인 획득</span><span id="run-balance">보상 저장 중</span><button id="reward-retry" class="btn mini" hidden>저장 재시도</button></div>
 <div class="run-actions"><button id="run-retry" class="btn sun">${ICONS.retry}다시 하기</button><button id="run-menu" class="btn">메인 메뉴</button></div>
</section></div>
<dialog id="tutorial" aria-labelledby="tutorial-title"><h2 id="tutorial-title">세 가지만 기억하세요</h2><div class="rule-grid">
 <article><div class="rule-picture" aria-hidden="true"><i class="tile land"></i><i class="tile trail"></i><i class="tile trail"></i><i class="tile land"></i></div><h3>돌아와야 내 땅</h3><p>내 땅 밖에 선을 긋고<br>내 땅으로 돌아오면 점령해요.</p></article>
 <article><div class="rule-picture" aria-hidden="true"><i class="tile trail"></i><i class="tile cut"></i><i class="tile trail"></i><i class="tile edge"></i></div><h3>선과 판 끝을 조심</h3><p>상대가 내 선을 끊거나<br>판 끝 갈색 선을 넘으면 탈락해요.</p></article>
 <article><div class="rule-picture" aria-hidden="true"><i class="tile land"></i><i class="tile land"></i><b>100%</b></div><h3 id="tutorial-mode-title">완전 점령</h3><p id="tutorial-mode-description">맵 전체를 내 땅으로 만들면 승리</p></article></div>
 <p class="tutorial-control">PC: WASD · 방향키 · 마우스 &nbsp;|&nbsp; 모바일: 조이스틱 · 화면 드래그 · 트랙패드 (설정)</p><div class="menu-actions"><button id="tutorial-go" class="btn sun">이해했어요</button><button id="tutorial-skip" data-testid="tutorial-skip" class="btn">건너뛰기</button></div></dialog>
<dialog id="settings-dialog" aria-labelledby="settings-title"><header class="sheet-head"><h2 id="settings-title">설정</h2><p class="settings-help">이 기기에 자동 저장돼요 · 온라인 판은 설정 중에도 계속돼요</p><button id="settings-close" class="btn sun">완료</button></header>
 <div class="settings-body">
  <fieldset class="control-options"><legend>모바일 조작 방법</legend>
   <label><input type="radio" name="mobile-controls" id="controls-joystick" value="joystick"><span class="opt-icon">${ICONS.joystick}</span><span><b>조이스틱</b><small>왼쪽 아래 스틱으로 방향을 정해요</small></span></label>
   <label><input type="radio" name="mobile-controls" id="controls-drag" value="drag"><span class="opt-icon">${ICONS.drag}</span><span><b>화면 드래그</b><small>빈 곳을 손가락으로 밀어 방향을 정해요</small></span></label>
   <label><input type="radio" name="mobile-controls" id="controls-trackpad" value="trackpad"><span class="opt-icon">${ICONS.trackpad}</span><span><b>PC식 트랙패드</b><small>가상 마우스를 움직여 PC처럼 조작해요</small></span></label>
   <p class="settings-help">손을 떼면 마지막 방향으로 계속 움직여요. 버튼·정보 카드 위에서는 드래그가 시작되지 않아요.</p>
  </fieldset>
  <div class="settings-side">
   <fieldset class="look-options"><legend>색감</legend>
    <label><input type="radio" name="color-style" id="look-pastel" value="pastel"><span class="look-sample pastel" aria-hidden="true"></span><b>파스텔</b></label>
    <label><input type="radio" name="color-style" id="look-vivid" value="vivid"><span class="look-sample vivid" aria-hidden="true"></span><b>선명</b></label>
   </fieldset>
   <fieldset class="vibration-box"><legend>전투 진동</legend><div class="vibration-row"><label class="vibration-option"><input type="checkbox" id="kill-vibration" role="switch"><span><b>처치·탈락 진동</b><small>처치하면 짧게, 탈락하면 길게</small></span></label><button id="vibration-test" class="btn mini">테스트</button></div></fieldset>
   <p id="vibration-support" class="settings-help"></p><p id="vibration-status" role="status" class="settings-help"></p>
  </div>
 </div></dialog>
<div id="notice" role="alert" hidden><p id="notice-text"></p><div id="notice-actions" hidden><button id="retry" class="btn mini">재시도</button><button id="fallback-practice" class="btn mini">봇 연습</button></div><button id="notice-close" aria-label="안내 닫기" class="btn icon small">${ICONS.close}</button></div>
<div id="joystick" aria-label="방향 조이스틱" hidden><div id="joystick-thumb"></div></div>`;
  get<HTMLInputElement>('nickname').value=stored('hexhold.nickname')??'플레이어';
  const bind=(id:string,action:()=>void)=>get(id).addEventListener('click',action);
  bind('game-tools-toggle',()=>{const open=get('game-tools').hidden;this.closeGamePanels();get('game-tools').hidden=!open;get('game-tools-toggle').setAttribute('aria-expanded',String(open));});
  bind('ranking-toggle',()=>this.togglePanel('leaderboard','ranking-toggle'));
  bind('ranking-close',()=>{get('leaderboard').hidden=true;get('ranking-toggle').setAttribute('aria-pressed','false');get('game-tools-toggle').focus();});
  bind('fullscreen-toggle',()=>void this.landscapeFullscreen());
  bind('leave-request',()=>{this.closeGamePanels();get('leave-confirm').hidden=false;get('leave-cancel').focus();});
  bind('leave-cancel',()=>{get('leave-confirm').hidden=true;get('game-tools-toggle').focus();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!this.isSettingsOpen()&&!get<HTMLDialogElement>('tutorial').open){this.closeGamePanels();}});
  bind('settings',()=>{get('vibration-status').textContent='';get<HTMLDialogElement>('settings-dialog').showModal();this.actions.settingsOpen?.(true);this.refreshSettings();});
  bind('settings-close',()=>get<HTMLDialogElement>('settings-dialog').close());
  get('settings-dialog').addEventListener('close',()=>{this.actions.settingsOpen?.(false);this.refreshControls();});
  for(const mode of ['joystick','drag','trackpad'] as const)get('controls-'+mode).addEventListener('change',()=>this.settings.update({mobileControls:mode}));
  for(const style of ['pastel','vivid'] as const)get('look-'+style).addEventListener('change',()=>this.settings.update({colorStyle:style as ColorStyle}));
  get('kill-vibration').addEventListener('change',()=>this.settings.update({killVibration:get<HTMLInputElement>('kill-vibration').checked}));
  bind('vibration-test',()=>{get('vibration-status').textContent=this.actions.testVibration?.()?'진동을 요청했어요. 무음 설정이나 기기에 따라 느껴지지 않을 수 있어요.':'이 환경에서는 진동을 실행할 수 없어요.';});
  this.settings.subscribe(()=>this.refreshSettings());this.refreshSettings();
  bind('practice',()=>this.requestPlay(this.actions.practice));
  bind('create',()=>this.requestPlay(()=>this.actions.create?this.actions.create():this.message('온라인 연결을 준비하고 있어요.')));
  bind('join',()=>this.requestPlay(()=>this.actions.join?this.actions.join(get<HTMLInputElement>('room-code').value.trim().toUpperCase()):this.message('온라인 연결을 준비하고 있어요.')));
  bind('leave',()=>{get('leave-confirm').hidden=true;this.actions.leave();});bind('room-leave',this.actions.leave);bind('result-leave',this.actions.leave);bind('restart',this.actions.restart);
  bind('reward-retry',()=>this.actions.rewardRetry?.());bind('run-retry',this.actions.restart);bind('run-menu',this.actions.leave);
  bind('start',()=>this.actions.start?.());bind('rules',()=>this.tutorial(null));bind('tutorial-go',()=>this.closeTutorial());bind('tutorial-skip',()=>this.closeTutorial());
  bind('notice-close',()=>get('notice').hidden=true);bind('retry',()=>this.actions.retry?.());bind('fallback-practice',()=>{get('notice').hidden=true;this.requestPlay(this.actions.practice);});
  get<HTMLDialogElement>('tutorial').addEventListener('cancel',event=>{event.preventDefault();this.closeTutorial();});
  bind('copy-link',()=>{const code=get('friend-code').textContent??'';(navigator.clipboard?.writeText(location.origin+'/?room='+encodeURIComponent(code))??Promise.reject(new Error('Clipboard unavailable'))).then(()=>this.message('초대 링크를 복사했어요.')).catch(()=>this.message('복사가 막혔어요. 이 링크를 직접 공유하세요: '+location.origin+'/?room='+encodeURIComponent(code)));});
 }
 private homeAppearance:MarkerAppearance|null=null;
 // The equipped marker stands on the home art's trail head, in the current color style.
 setHomeMarker(appearance:MarkerAppearance):void {this.homeAppearance={...appearance};get('home-marker').replaceChildren(markerPreview(appearance,SLOT_COLORS[0]));}
 selectedGameMode():GameModeId{return 'classic';}
 private togglePanel(panel:string,button:string):void{const open=get(panel).hidden;this.closeGamePanels();get(panel).hidden=!open;get(button).setAttribute('aria-pressed',String(open));}
 private closeGamePanels():void{for(const id of ['game-tools','leaderboard','leave-confirm'])get(id).hidden=true;get('game-tools-toggle').setAttribute('aria-expanded','false');get('ranking-toggle').setAttribute('aria-pressed','false');}
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
  const settings=this.settings.get();get<HTMLInputElement>('controls-'+settings.mobileControls).checked=true;get<HTMLInputElement>('look-'+settings.colorStyle).checked=true;get<HTMLInputElement>('kill-vibration').checked=settings.killVibration;
  const supported=browserHaptics().supported();get('vibration-support').textContent=supported?'지원되는 모바일 브라우저에서 동작해요.':'현재 환경에서는 진동을 지원하지 않아요.';
  get<HTMLButtonElement>('vibration-test').disabled=!supported||!settings.killVibration;this.refreshControls();
  if(this.homeAppearance)this.setHomeMarker(this.homeAppearance);
 }
 private refreshControls():void{get('joystick').hidden=!this.controlsActive||this.isSettingsOpen()||!matchMedia('(pointer:coarse)').matches||this.settings.get().mobileControls!=='joystick';}
 nickname():string {const name=normalizeNickname(get<HTMLInputElement>('nickname').value);if(!name)throw new Error('닉네임은 공백 정리 후 1–16자로 입력하세요.');save('hexhold.nickname',name);return name;}
 private requestPlay(action:()=>void):void {try{this.nickname();if(stored('hexhold.tutorialSeen')!=='1')this.tutorial(action);else action();}catch(error){this.message((error as Error).message);}}
 private tutorial(action:(()=>void)|null):void {this.pending=action;const mode=this.mode==='MENU'?createMode():this.activeMode;get('tutorial-mode-title').textContent=GAME_MODES[mode.id].subtitle;get('tutorial-mode-description').textContent=GAME_MODES[mode.id].description+' · '+GAME_MODES[mode.id].rules(mode);get<HTMLDialogElement>('tutorial').showModal();}
 private closeTutorial():void {get<HTMLDialogElement>('tutorial').close();save('hexhold.tutorialSeen','1');const action=this.pending;this.pending=null;action?.();}
 showMenu():void {
  this.controlsActive=false;
  this.clearRunResult();this.mode='MENU';get('app').dataset.screen='menu';this.resultId='';get('menu').hidden=false;
  this.closeGamePanels();for(const id of ['hud','minimap','rotate-hint','control-hint','death','results','room-panel','joystick'])get(id).hidden=true;
  screen.orientation?.unlock?.();
 }
 showGame(mode:'PRACTICE'|'ONLINE'):void {
  this.mode=mode;get('app').dataset.screen='game';get('menu').hidden=true;get('room-panel').hidden=true;get('results').hidden=true;
  this.closeGamePanels();get('hud').hidden=false;get('minimap').hidden=false;get('rotate-hint').hidden=false;get('control-hint').hidden=true;
  this.controlsActive=true;this.refreshControls();
 }
 private showCaptureGain(percent:number,loss=false):void {
  const toast=get('capture-toast');toast.textContent=loss?gainLabel(percent).replace('+','−'):gainLabel(percent);toast.hidden=false;toast.classList.toggle('loss',loss);
  // Restart the pop animation for back-to-back captures.
  toast.classList.remove('pop');void toast.offsetWidth;toast.classList.add('pop');
  if(this.toastTimer!==null)clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{toast.hidden=true;this.toastTimer=null;},1400);
 }
 updateView(view:MatchView,selfId:string,init=false,colors:readonly number[]=SLOT_COLORS):void {
  const self=view.participants.find(p=>p.participantId===selfId);if(!self)return;
  this.controlsActive=view.phase==='RUNNING'&&self.lifeState==='ALIVE';this.refreshControls();get('joystick').classList.toggle('respawn-paused',self.lifeState!=='ALIVE');
  this.activeMode=view.gameMode;this.totalCells=view.owners.length;
  get('hud').dataset.matchId=view.matchId;get('hud').dataset.selfId=selfId;get('hud').dataset.lifeId=String(self.lifeId);get('hud').dataset.tick=String(view.tick);
  get('score').textContent=territoryPercent(self.territoryCount,this.totalCells).toFixed(1)+'%';get('score-detail').textContent='영토 '+self.territoryCount+' / '+this.totalCells+'칸';
  get('kill-count').textContent=String(self.run?Math.max(0,self.kills-self.run.initialKills):self.kills);
  // The capture bubble wears my own colour; dark colours get white text.
  const mine=colors[self.slot],toast=get('capture-toast'),luma=(0.299*(mine>>16&255)+0.587*(mine>>8&255)+0.114*(mine&255))/255;
  toast.style.setProperty('--player',cssHex(mine));toast.style.color=luma<.55?'#ffffff':'#1f1b2d';
  const life=view.matchId+':'+self.lifeId;
  if(init||life!==this.toastLife||self.lifeState!=='ALIVE'){this.toastLife=life;this.toastCells=self.territoryCount;}
  else if(self.territoryCount>this.toastCells){if(view.phase==='RUNNING')this.showCaptureGain((self.territoryCount-this.toastCells)*100/this.totalCells);this.toastCells=self.territoryCount;}
  else if(self.territoryCount<this.toastCells){if(view.phase==='RUNNING')this.showCaptureGain((this.toastCells-self.territoryCount)*100/this.totalCells,true);this.toastCells=self.territoryCount;}
  get('population').textContent='사람 '+view.participants.filter(p=>p.kind==='HUMAN').length+' · 봇 '+view.participants.filter(p=>p.kind==='BOT').length;
  const ordered=[...view.participants].sort((a,b)=>b.territoryCount-a.territoryCount||b.kills-a.kills);
  const key=JSON.stringify([colors,selfId,this.totalCells,view.gameMode.id,ordered.map(p=>[p.participantId,p.nickname,p.kind,p.slot,p.territoryCount,p.kills])]);
  if(key!==this.boardKey){this.boardKey=key;const list=get('ranking'),mini=get('mini-board');list.replaceChildren();mini.replaceChildren();let rank=0;
   ordered.forEach((p,i)=>{const previous=ordered[i-1];if(!previous||p.territoryCount!==previous.territoryCount||p.kills!==previous.kills)rank=i+1;
    const isSelf=p.participantId===selfId,color=cssHex(colors[p.slot]),percent=territoryPercent(p.territoryCount,this.totalCells).toFixed(1)+'%';
    const row=document.createElement('li');if(isSelf)row.className='self';
    const number=document.createElement('span');number.className='rank-number';number.textContent=String(rank);
    const name=document.createElement('span');name.className='rank-name';name.textContent=p.nickname;name.style.setProperty('--player',color);
    if(p.kind==='BOT'){const bot=document.createElement('small');bot.textContent='봇';name.append(bot);}
    const score=document.createElement('b'),percentNode=document.createElement('span'),kills=document.createElement('small');percentNode.className='rank-percent';percentNode.textContent=percent;kills.className='rank-kills';kills.textContent='처치 '+p.kills;score.append(percentNode,kills);row.append(number,name,score);list.append(row);
    // The HUD keeps the top three plus my own row.
    if(i<3||isSelf){const item=document.createElement('li');if(isSelf)item.className='self';item.style.setProperty('--player',color);
     const r=document.createElement('span');r.className='mini-rank';r.textContent=String(rank);const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');
     const n=document.createElement('span');n.className='mini-name';n.textContent=p.nickname;const pct=document.createElement('b');pct.textContent=percent;item.append(r,dot,n,pct);mini.append(item);}
   });
  }
  const death=get('death');death.hidden=self.lifeState==='ALIVE'||view.phase!=='RUNNING'||this.hasRunResult;
  if(self.lifeState==='ELIMINATED')this.deathText=deathMessage(self.deathReason,self.deathContext);
  death.textContent=self.lifeState==='SPAWN_BLOCKED'?'안전한 '+(1+3*view.config.spawnRadius*(view.config.spawnRadius+1))+'칸을 찾고 있어요.':self.lifeState==='ELIMINATED'?this.deathText:'시작 위치를 준비하고 있어요.';
  if(self.run?.result&&self.lifeState!=='SPAWN_BLOCKED'&&self.lifeState!=='DEAD_WAIT')this.showRunResult(self.run.result,init);
  else if(self.lifeState==='ALIVE')this.clearRunResult();
  else if(view.phase==='FINISHED'&&!self.run)this.showResults(view.matchId,view.results??[],selfId,view.gameMode,view.outcome,view.owners.length);
 }
 setProfileBalance(coins:number|null):void {get('menu-coins').textContent=coins===null?'저장 불가':coins.toLocaleString();}
 showReward(runId:string,receipt:RewardReceipt):void {if(this.runKey!==runId)return;const amount=receipt.reward?.totalCoins;get('run-coins').textContent=amount!==undefined?'+'+amount.toLocaleString():receipt.status==='failed'?'저장 실패':'지급 내역 없음';get('run-balance').textContent=receipt.status==='failed'?'보상을 저장하지 못했어요':receipt.reward?'보유 '+receipt.balance.toLocaleString():'다시 지급하지 않았어요';get('reward-retry').hidden=receipt.status!=='failed';}
 setRunRetryAvailable(available:boolean):void {get<HTMLButtonElement>('run-retry').disabled=!available;}
 get hasRunResult():boolean{return !!this.runKey;}
 clearRunResult():void {if(this.runTimer!==null)clearTimeout(this.runTimer);this.runTimer=null;this.runKey='';this.currentRunResult=null;get('run-results').hidden=true;}
 showRunResult(result:RunResult,restored=false):void {
  if(this.runKey===result.runId)return;this.clearRunResult();this.runKey=result.runId;this.currentRunResult=result;get('run-coins').textContent='…';get('run-balance').textContent='보상 저장 중';get('reward-retry').hidden=true;this.controlsActive=false;this.refreshControls();
  const show=()=>{if(this.runKey!==result.runId)return;this.runTimer=null;
   const kind=result.endReason==='FULL_CAPTURE_WIN'?'win':result.endReason==='DEATH'?'death':'loss';get('run-results').dataset.outcome=kind;
   get('run-title').textContent=kind==='win'?'완전 점령!':kind==='death'?'탈락!':'판 종료';
   get('run-reason').textContent=kind==='death'?(this.deathText||'이번 생존의 기록'):kind==='loss'?'다른 참가자가 100%를 달성했어요':'월드 전체를 내 땅으로 만들었어요';
   get('run-best').textContent=result.bestTerritoryPercent.toFixed(1)+'%';const seconds=Math.floor(result.durationTicks/result.simulationHz);get('run-time').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');get('run-kills').textContent=String(result.kills);
   this.closeGamePanels();get('results').hidden=true;get('death').hidden=true;get('joystick').hidden=true;get('hud').hidden=true;get('minimap').hidden=true;get('rotate-hint').hidden=true;get('run-results').hidden=false;get('run-retry').focus();
  };
  if(result.endReason==='DEATH'&&!restored)this.runTimer=setTimeout(show,700);else show();
 }
 showResults(matchId:string,rows:ResultRow[],selfId:string,mode=this.activeMode,outcome:MatchOutcome|null=null,totalCells=this.totalCells):void {
  this.controlsActive=false;
  this.activeMode=mode;this.totalCells=totalCells;
  get('app').dataset.screen='game';get('menu').hidden=true;get('room-panel').hidden=true;
  get('results').hidden=false;get('death').hidden=true;get('joystick').hidden=true;
  this.closeGamePanels();get('hud').hidden=true;get('minimap').hidden=true;get('rotate-hint').hidden=true;
  if(this.resultId===matchId)return;this.resultId=matchId;
  const self=rows.find(p=>p.participantId===selfId),winner=rows.find(p=>p.participantId===outcome?.winnerId);get('result-mode').textContent=modeLabel(mode);get('winner-result').textContent=winner?winner.nickname+' 승리!':'이번 판의 영역 기록';get('personal-result').textContent=self?'내 순위 '+(self.rank??'나감')+' · '+territoryPercent(self.territory,totalCells).toFixed(1)+'% · 처치 '+self.kills:'경기가 끝났어요.';
  get('result-rows').replaceChildren();
  for(const row of rows){const tr=document.createElement('tr');if(row.participantId===selfId)tr.className='self';
   for(const value of [(row.rank??'나감')+' · '+row.nickname+(row.kind==='BOT'?' (봇)':''),territoryPercent(row.territory,totalCells).toFixed(1)+'%',row.territory,row.kills+' / '+row.deaths]){
    const td=document.createElement('td');td.textContent=String(value);tr.append(td);
   }get('result-rows').append(tr);
  }
  get('restart').textContent=this.mode==='ONLINE'?'다음 판 참가':'다시 연습';
  get('next-round').textContent=this.mode==='ONLINE'?'방에 남아 있으면 결과 7초 뒤 다음 카운트다운이 시작돼요.':'연습은 직접 다시 시작할 수 있어요.';
 }
 showRoom(view:RoomDisplay):void {
  this.controlsActive=false;
  this.mode='ONLINE';get('app').dataset.screen='room';get('menu').hidden=true;get('hud').hidden=true;get('leaderboard').hidden=true;get('minimap').hidden=true;get('results').hidden=true;get('room-panel').hidden=false;
  this.closeGamePanels();for(const id of ['control-hint','rotate-hint','joystick','death'])get(id).hidden=true;
  get('room-kind').textContent=view.mode==='FRIEND'?'친구 방':'공개 대전';
  get('room-title').textContent=view.mode==='FRIEND'?'친구와 같은 판에서.':'상대를 모으고 있어요.';
  this.activeMode=view.gameMode;get('room-game-mode').textContent=modeLabel(view.gameMode);
  get('room-status').textContent=view.waitingForNextRound?'현재 경기 진행 중 · 다음 라운드 참가 대기':view.phase==='COUNTDOWN'?Math.ceil(view.remainingSeconds??0)+'초 후 시작해요.':view.mode==='PUBLIC'?'빈자리는 봇이 채워요. 곧 출발!':'부족한 인원은 봇으로 채워요.';
  get('invite').hidden=view.mode!=='FRIEND';
  const code=get('friend-code');code.replaceChildren(...[...(view.code??'')].map(letter=>{const tile=document.createElement('span');tile.textContent=letter;return tile;}));
  get('members').replaceChildren();for(const member of view.members){const li=document.createElement('li');li.textContent=member.nickname+(member.memberId===view.hostId?' · 방장':'')+(!member.connected?' · 복구 대기':'')+(member.waitingForNextRound?' · 다음 판':'');if(member.memberId===view.selfMemberId)li.className='self';get('members').append(li);}
  get('start').hidden=!(view.mode==='FRIEND'&&view.phase==='WAITING'&&view.hostId===view.selfMemberId);
 }
 clearMessage():void {if(performance.now()>=this.noticeUntil)get('notice').hidden=true;}
 message(text:string,recovery=false,holdMs=0):void {this.noticeUntil=performance.now()+holdMs;get('notice').hidden=false;get('notice-text').textContent=text;get('notice-actions').hidden=!recovery;}
}

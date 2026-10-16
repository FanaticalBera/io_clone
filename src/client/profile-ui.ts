import {markerPreview} from './marker-art.js';
import {profileViewModel,type ProfileViewModel} from './profile-view-model.js';
import type {PlayerProfileV1} from './profile.js';
import type {ProfileStore} from './profile-store.js';
import {ICONS} from './icons.js';
import {styledColor} from './player-colors.js';
import {cssHex} from './theme.js';
import {MAP_ICONS} from './map-icons.js';
export class ProfileUI {
 private dialog:HTMLDialogElement;private model:ProfileViewModel|null=null;private revision=0;private request=0;private previewKey='';
 constructor(private store:ProfileStore,private canOpen:()=>boolean,private openDex:()=>void=()=>{}){
  this.dialog=document.createElement('dialog');this.dialog.id='profile-dialog';this.dialog.className='sheet';this.dialog.setAttribute('aria-labelledby','profile-title');
  this.dialog.innerHTML='<header class="sheet-bar"><button id="profile-close" class="btn icon" aria-label="프로필 닫기">'+ICONS.back+'</button><h2 id="profile-title">프로필</h2><span class="coin-pill">'+ICONS.coin+'<strong id="profile-coins">…</strong></span></header>'+
   '<div class="sheet-panel profile-panel"><div id="profile-content" class="profile-content"><section class="profile-collection" aria-label="장착과 보유"><div class="equipped"><div class="pedestal small"><div id="profile-preview"></div></div><div class="equipped-text"><small>장착 중</small><strong id="profile-marker-name">—</strong><span class="profile-color"><i id="profile-color-chip" aria-hidden="true"></i><span id="profile-color-name">—</span></span></div></div>'+
   '<dl class="profile-owned"><div><dt>보유 마커</dt><dd id="profile-markers">—</dd><span class="bar" aria-hidden="true"><i id="profile-markers-bar"></i></span></div><div><dt>보유 색상</dt><dd id="profile-colors">—</dd><span class="bar" aria-hidden="true"><i id="profile-colors-bar"></i></span></div></dl><button id="profile-dex" class="btn mini profile-dex">마커 도감 보기</button></section>'+
   '<section class="profile-stats" aria-label="누적 기록"><article class="profile-map"><div class="profile-modes" role="group" aria-label="모드"><button class="mode-chip" data-mode="classic">클래식</button><button class="mode-chip" data-mode="growth">성장</button><button class="mode-chip" data-mode="timed">점령전</button></div>'+
   '<div class="profile-map-bar"><button id="profile-map-prev" class="map-step" aria-label="이전 맵">‹</button><span id="profile-map-icon" class="map-icon" aria-hidden="true"></span><strong id="profile-map-name">—</strong><button id="profile-map-next" class="map-step" aria-label="다음 맵">›</button></div>'+
   '<span id="profile-map-dots" class="map-dots" aria-hidden="true"></span><div class="profile-map-best"><small id="profile-best-label">최고 점유율</small><strong id="profile-best">—</strong></div>'+
   '<p id="profile-map-sub" class="profile-map-sub"><span>완주 <b id="profile-map-clears">—</b></span><span><b id="profile-map-runs">—</b></span><span><b id="profile-map-kills">—</b></span></p></article>'+
   [['runs','총 플레이'],['kills','총 처치'],['clears','총 완주'],['longest','최장 생존']].map(([id,label])=>'<article><small>'+label+'</small><strong id="profile-'+id+'">—</strong></article>').join('')+'</section>'+
   '</div><footer class="profile-footer"><span id="profile-status" role="status">불러오는 중…</span><button id="profile-reload" class="btn mini" hidden>다시 읽기</button></footer></div>';
  document.getElementById('app')!.append(this.dialog);
  document.getElementById('profile-open')!.addEventListener('click',()=>this.open());this.get('profile-close').addEventListener('click',()=>this.dialog.close());
  this.get('profile-reload').addEventListener('click',()=>void this.refresh());for(const chip of this.dialog.querySelectorAll<HTMLElement>('.profile-modes button'))chip.addEventListener('click',()=>{this.cardMode=chip.dataset.mode as 'classic'|'growth'|'timed';this.renderMap();});this.get('profile-map-prev').addEventListener('click',()=>this.stepMap(-1));this.get('profile-map-next').addEventListener('click',()=>this.stepMap(1));this.get('profile-dex').addEventListener('click',()=>{this.dialog.close();this.openDex();});this.dialog.addEventListener('close',()=>{this.request++;this.dialog.setAttribute('aria-busy','false');});
  // Main applies the existing local/BroadcastChannel profile updates.
 }
 private get(id:string):HTMLElement{return this.dialog.querySelector<HTMLElement>('#'+id)!;}
 setProfile(profile:PlayerProfileV1):void {this.revision++;this.model=profileViewModel(profile);if(this.dialog.open){this.render();this.status('이 기기에 저장된, 끝까지 마친 판 기록이에요.');}}
 open():void {if(!this.canOpen()||this.dialog.open||document.querySelector('dialog[open]'))return;this.mapIndex=null;this.dialog.showModal();this.render();void this.refresh();}
 private status(message:string,error=false):void {this.get('profile-status').textContent=message;this.get('profile-status').classList.toggle('profile-error',error);this.get('profile-reload').hidden=!error;}
 private async refresh():Promise<void>{
  const request=++this.request,revision=this.revision;this.dialog.setAttribute('aria-busy','true');this.status('불러오는 중…');
  try{const profile=await this.store.readForDisplay();if(request!==this.request)return;if(revision===this.revision)this.setProfile(profile);}
  catch{if(request!==this.request||revision!==this.revision)return;this.model=null;this.render();this.get('profile-coins').textContent='읽기 불가';this.status('저장소를 읽지 못했어요. 다시 읽기를 눌러 주세요.',true);}
  finally{if(request===this.request)this.dialog.setAttribute('aria-busy','false');}
 }
 private value(id:string,value:string):void {const node=this.get(id);node.textContent=value;node.dataset.long=String(value.length>8);}
 private mapIndex:number|null=null;private cardMode:'classic'|'growth'|'timed'='classic';
 private stepMap(delta:number):void{const m=this.model;if(!m)return;this.mapIndex=((this.mapIndex??m.lastMap)+delta+m.maps.length)%m.maps.length;this.renderMap();}
 /** The map record card: best, clears and runs on one board, starting on the last map played. */
 private renderMap():void{
  const m=this.model;if(!m)return;const index=this.mapIndex??m.lastMap,map=m.maps[index];
  this.get('profile-map-name').textContent=map.name;this.get('profile-map-icon').innerHTML=MAP_ICONS[map.id]??'';
  for(const chip of this.dialog.querySelectorAll<HTMLElement>('.profile-modes button'))chip.setAttribute('aria-pressed',String(chip.dataset.mode===this.cardMode));
  // Each mode shows what matters in it: classic its best and clears, growth its 3-minute best, the round its first places.
  const r=this.cardMode==='classic'?map:map[this.cardMode],label=this.get('profile-best-label'),sub=this.get('profile-map-sub');
  const part=(text:string,id?:string)=>{const span=document.createElement('span');const b=document.createElement('b');if(id)b.id=id;b.textContent=text;span.append(b);return span;};
  if(this.cardMode==='timed'){label.textContent='1위';this.value('profile-best',r.runs?r.clears.toLocaleString()+'회':'—');
   sub.replaceChildren(part(r.runs.toLocaleString()+'판','profile-map-runs'),part('최고 '+(r.runs?r.best.toFixed(1)+'%':'—')),part('최다 '+r.topKills+'킬'));}
  else if(this.cardMode==='growth'){label.textContent='3분 최고 점유율';this.value('profile-best',r.runs?r.best.toFixed(1)+'%':'—');
   sub.replaceChildren(part(r.runs.toLocaleString()+'판','profile-map-runs'),part('한 판 최다 '+r.topKills+'킬'));}
  else{label.textContent='최고 점유율';this.value('profile-best',r.runs?r.best.toFixed(1)+'%':'—');
   const clears=part(r.clears.toLocaleString()+'회','profile-map-clears');clears.prepend('완주 ');sub.replaceChildren(clears,part(r.runs.toLocaleString()+'판','profile-map-runs'),part(r.kills.toLocaleString()+'킬','profile-map-kills'));}
  this.get('profile-map-dots').replaceChildren(...m.maps.map((_,i)=>{const dot=document.createElement('i');if(i===index)dot.className='on';return dot;}));
 }
 private render():void {
  const m=this.model;this.get('profile-content').hidden=!m;if(!m){this.get('profile-coins').textContent='…';return;}
  this.value('profile-coins',m.coins.toLocaleString());this.value('profile-runs',m.stats.runsPlayed.toLocaleString());this.value('profile-kills',m.stats.totalKills.toLocaleString());this.value('profile-clears',m.stats.classicClears.toLocaleString());this.renderMap();
  const seconds=m.stats.longestRunSeconds;this.value('profile-longest',seconds<60?seconds.toFixed(1)+'초':Math.floor(seconds/60).toLocaleString()+'분 '+Math.floor(seconds%60)+'초');
  this.get('profile-marker-name').textContent=m.equipped.markerName;this.get('profile-color-name').textContent=m.equipped.colorName;
  this.get('profile-color-chip').style.backgroundColor=cssHex(styledColor(m.equipped.colorValue??0x16cdb1));
  this.get('profile-markers').textContent=m.collection.markersOwned+' / '+m.collection.markersTotal;this.get('profile-colors').textContent=m.collection.colorsOwned+' / '+m.collection.colorsTotal;
  this.get('profile-markers-bar').style.width=(100*m.collection.markersOwned/m.collection.markersTotal)+'%';this.get('profile-colors-bar').style.width=(100*m.collection.colorsOwned/m.collection.colorsTotal)+'%';
  const key=m.equipped.markerId+':'+m.equipped.colorId+':'+styledColor(0x16cdb1);if(this.previewKey!==key){this.previewKey=key;this.get('profile-preview').replaceChildren(markerPreview({markerId:m.equipped.markerId,markerColorId:m.equipped.colorId},0x16cdb1));}
 }
}

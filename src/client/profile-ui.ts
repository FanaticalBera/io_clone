import {markerPreview} from './marker-art.js';
import {profileViewModel,type ProfileViewModel} from './profile-view-model.js';
import type {PlayerProfileV1} from './profile.js';
import type {ProfileStore} from './profile-store.js';
import {ICONS} from './icons.js';
import {styledColor} from './player-colors.js';
import {cssHex} from './theme.js';
export class ProfileUI {
 private dialog:HTMLDialogElement;private model:ProfileViewModel|null=null;private revision=0;private request=0;private previewKey='';
 constructor(private store:ProfileStore,private canOpen:()=>boolean){
  this.dialog=document.createElement('dialog');this.dialog.id='profile-dialog';this.dialog.className='sheet';this.dialog.setAttribute('aria-labelledby','profile-title');
  this.dialog.innerHTML='<header class="sheet-bar"><button id="profile-close" class="btn icon" aria-label="프로필 닫기">'+ICONS.back+'</button><h2 id="profile-title">프로필</h2><span class="coin-pill">'+ICONS.coin+'<strong id="profile-coins">…</strong></span></header>'+
   '<div class="sheet-panel profile-panel"><div id="profile-content" class="profile-content"><section class="profile-collection" aria-label="장착과 보유"><div class="equipped"><div class="pedestal small"><div id="profile-preview"></div></div><div class="equipped-text"><small>장착 중</small><strong id="profile-marker-name">—</strong><span class="profile-color"><i id="profile-color-chip" aria-hidden="true"></i><span id="profile-color-name">—</span></span></div></div>'+
   '<dl class="profile-owned"><div><dt>보유 마커</dt><dd id="profile-markers">—</dd><span class="bar" aria-hidden="true"><i id="profile-markers-bar"></i></span></div><div><dt>보유 색상</dt><dd id="profile-colors">—</dd><span class="bar" aria-hidden="true"><i id="profile-colors-bar"></i></span></div></dl></section>'+
   '<section class="profile-stats" aria-label="누적 기록">'+[['best','최고 점유율'],['runs','총 플레이'],['kills','총 처치'],['clears','클래식 완주'],['longest','최장 생존']].map(([id,label])=>'<article><small>'+label+'</small><strong id="profile-'+id+'">—</strong></article>').join('')+'</section>'+
   '</div><footer class="profile-footer"><span id="profile-status" role="status">불러오는 중…</span><button id="profile-reload" class="btn mini" hidden>다시 읽기</button></footer></div>';
  document.getElementById('app')!.append(this.dialog);
  document.getElementById('profile-open')!.addEventListener('click',()=>this.open());this.get('profile-close').addEventListener('click',()=>this.dialog.close());
  this.get('profile-reload').addEventListener('click',()=>void this.refresh());this.dialog.addEventListener('close',()=>{this.request++;this.dialog.setAttribute('aria-busy','false');});
  // Main applies the existing local/BroadcastChannel profile updates.
 }
 private get(id:string):HTMLElement{return this.dialog.querySelector<HTMLElement>('#'+id)!;}
 setProfile(profile:PlayerProfileV1):void {this.revision++;this.model=profileViewModel(profile);if(this.dialog.open){this.render();this.status('이 기기에 저장된, 끝까지 마친 판 기준이에요.');}}
 open():void {if(!this.canOpen()||this.dialog.open||document.querySelector('dialog[open]'))return;this.dialog.showModal();this.render();void this.refresh();}
 private status(message:string,error=false):void {this.get('profile-status').textContent=message;this.get('profile-status').classList.toggle('profile-error',error);this.get('profile-reload').hidden=!error;}
 private async refresh():Promise<void>{
  const request=++this.request,revision=this.revision;this.dialog.setAttribute('aria-busy','true');this.status('불러오는 중…');
  try{const profile=await this.store.readForDisplay();if(request!==this.request)return;if(revision===this.revision)this.setProfile(profile);}
  catch{if(request!==this.request||revision!==this.revision)return;this.model=null;this.render();this.get('profile-coins').textContent='읽기 불가';this.status('저장소를 읽지 못했어요. 다시 읽기를 눌러 주세요.',true);}
  finally{if(request===this.request)this.dialog.setAttribute('aria-busy','false');}
 }
 private value(id:string,value:string):void {const node=this.get(id);node.textContent=value;node.dataset.long=String(value.length>8);}
 private render():void {
  const m=this.model;this.get('profile-content').hidden=!m;if(!m){this.get('profile-coins').textContent='…';return;}
  this.value('profile-coins',m.coins.toLocaleString());this.value('profile-runs',m.stats.runsPlayed.toLocaleString());this.value('profile-kills',m.stats.totalKills.toLocaleString());this.value('profile-best',m.stats.bestTerritoryPercent.toFixed(1)+'%');this.value('profile-clears',m.stats.classicClears.toLocaleString());
  const seconds=m.stats.longestRunSeconds;this.value('profile-longest',seconds<60?seconds.toFixed(1)+'초':Math.floor(seconds/60).toLocaleString()+'분 '+Math.floor(seconds%60)+'초');
  this.get('profile-marker-name').textContent=m.equipped.markerName;this.get('profile-color-name').textContent=m.equipped.colorName;
  this.get('profile-color-chip').style.backgroundColor=cssHex(styledColor(m.equipped.colorValue??0x16cdb1));
  this.get('profile-markers').textContent=m.collection.markersOwned+' / '+m.collection.markersTotal;this.get('profile-colors').textContent=m.collection.colorsOwned+' / '+m.collection.colorsTotal;
  this.get('profile-markers-bar').style.width=(100*m.collection.markersOwned/m.collection.markersTotal)+'%';this.get('profile-colors-bar').style.width=(100*m.collection.colorsOwned/m.collection.colorsTotal)+'%';
  const key=m.equipped.markerId+':'+m.equipped.colorId+':'+styledColor(0x16cdb1);if(this.previewKey!==key){this.previewKey=key;this.get('profile-preview').replaceChildren(markerPreview({markerId:m.equipped.markerId,markerColorId:m.equipped.colorId},0x16cdb1));}
 }
}

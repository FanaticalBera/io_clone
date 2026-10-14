import {MARKERS,MARKER_CATEGORIES,CATEGORY_LABELS,MARKER_SETS,SOLD_MARKERS} from './catalog.js';
import {markerPreview} from './marker-art.js';
import type {PlayerProfileV1} from './profile.js';
import type {ProfileStore} from './profile-store.js';
import {ICONS} from './icons.js';
/** Marker book: owned markers in colour, missing ones as silhouettes, set progress and titles. */
export class DexUI {
 private dialog:HTMLDialogElement;
 constructor(private store:ProfileStore,private onClose:()=>void){
  this.dialog=document.createElement('dialog');this.dialog.id='dex-dialog';this.dialog.className='sheet';this.dialog.setAttribute('aria-labelledby','dex-title');
  this.dialog.innerHTML='<header class="sheet-bar"><button id="dex-close" class="btn icon" aria-label="도감 닫기">'+ICONS.back+'</button><h2 id="dex-title">마커 도감</h2><span id="dex-count" class="coin-pill"><strong>…</strong></span></header><div class="sheet-panel"><div id="dex-content" class="dex-content"></div></div>';
  document.getElementById('app')!.append(this.dialog);
  this.dialog.querySelector('#dex-close')!.addEventListener('click',()=>this.dialog.close());
  this.dialog.addEventListener('close',()=>this.onClose());
 }
 async open():Promise<void>{
  if(this.dialog.open)return;this.dialog.showModal();
  try{this.render(await this.store.readForDisplay());}catch{this.dialog.querySelector('#dex-content')!.textContent='저장소를 읽지 못했어요.';}
 }
 private cell(id:string,owned:boolean):HTMLElement{
  const cell=document.createElement('div');cell.className='dex-cell'+(owned?'':' missing');cell.dataset.markerId=id;
  cell.append(markerPreview({markerId:id,markerColorId:'slot'},0x16cdb1));
  const name=document.createElement('small');name.textContent=owned?MARKERS.find(m=>m.id===id)!.name:'???';cell.append(name);return cell;
 }
 private section(title:string,cells:HTMLElement[]):HTMLElement{
  const section=document.createElement('section');section.className='dex-category';
  const head=document.createElement('h3');head.textContent=title;
  const grid=document.createElement('div');grid.className='dex-grid';grid.append(...cells);section.append(head,grid);return section;
 }
 private render(p:PlayerProfileV1):void {
  const have=new Set(p.inventory.ownedMarkerIds),root=this.dialog.querySelector('#dex-content')!;root.replaceChildren();
  this.dialog.querySelector('#dex-count strong')!.textContent=MARKERS.filter(m=>have.has(m.id)).length+' / '+MARKERS.length;
  const sets=document.createElement('section');sets.className='dex-sets';
  for(const s of MARKER_SETS){
   const n=s.ids.filter(id=>have.has(id)).length,done=n===s.ids.length,chip=document.createElement('div');chip.className='dex-set'+(done?' done':'');
   const name=document.createElement('strong'),note=document.createElement('small');name.textContent=done?s.title:s.name;note.textContent=done?s.name+' 완성':n+' / '+s.ids.length;
   chip.append(name,note);sets.append(chip);
  }
  root.append(sets);
  for(const category of MARKER_CATEGORIES){
   const sold=SOLD_MARKERS.filter(m=>m.category===category),reward=MARKERS.find(m=>m.reward===category);
   const cells=sold.map(m=>this.cell(m.id,have.has(m.id)));
   if(reward){const prize=this.cell(reward.id,have.has(reward.id));prize.classList.add('reward');cells.push(prize);}
   root.append(this.section(CATEGORY_LABELS[category]+'  '+sold.filter(m=>have.has(m.id)).length+' / '+sold.length,cells));
  }
  const final=MARKERS.find(m=>m.reward==='ALL');
  if(final){const prize=this.cell(final.id,have.has(final.id));prize.classList.add('reward');root.append(this.section('전부 모으면',[prize]));}
 }
}

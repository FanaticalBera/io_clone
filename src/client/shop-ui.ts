import {MARKERS,MARKER_COLORS,MARKER_CATEGORIES,CATEGORY_LABELS,DEFAULT_MARKER_ID,DEFAULT_MARKER_COLOR_ID,productDefinition,type ProductKind,type MarkerCategory} from './catalog.js';
import {ownedItem,equippedItem,type ShopReceipt} from './inventory.js';
import {markerPreview,type MarkerAppearance} from './marker-art.js';
import type {PlayerProfileV1} from './profile.js';
import {ProfileStore} from './profile-store.js';
import {ICONS} from './icons.js';
import {styledColor} from './player-colors.js';
import {cssHex} from './theme.js';
const get=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export class ShopUI {
  private profile:PlayerProfileV1|null=null;
  private kind:ProductKind='marker';private category:MarkerCategory|'ALL'='ALL';
  private selected=DEFAULT_MARKER_ID;private ownedOnly=false;private pending=false;
  private dialog:HTMLDialogElement;
  constructor(private store:ProfileStore,private canOpen:()=>boolean,private loaded:(p:PlayerProfileV1)=>void,private slotColor=0x16cdb1){
    this.dialog=document.createElement('dialog');this.dialog.id='shop-dialog';this.dialog.className='sheet';this.dialog.setAttribute('aria-labelledby','shop-title');
    this.dialog.innerHTML='<header class="sheet-bar"><button id="shop-close" class="btn icon" aria-label="상점 닫기">'+ICONS.back+'</button><h2 id="shop-title">상점</h2>'+
      '<nav class="shop-tabs" aria-label="상품 종류"><button id="shop-markers" aria-pressed="true">마커</button><button id="shop-colors" aria-pressed="false">색상</button></nav>'+
      '<span class="coin-pill">'+ICONS.coin+'<strong id="shop-coins">…</strong></span></header>'+
      '<div class="sheet-panel shop-content"><aside class="shop-detail"><div class="pedestal"><div id="shop-preview"></div></div><strong id="shop-item-name"></strong><small id="shop-item-note"></small><button id="shop-action" class="btn sun" disabled>불러오는 중</button></aside>'+
      '<div class="shop-main"><div class="shop-filters"><nav id="shop-categories" class="shop-categories" aria-label="마커 카테고리"></nav><button id="shop-owned" class="chip owned" aria-pressed="false"><i aria-hidden="true"></i>보유만</button></div>'+
      '<div id="shop-items" class="shop-items" aria-label="상품 목록"></div>'+
      '<footer class="shop-footer"><span id="shop-status" role="status" aria-live="polite">가격은 테스트 값이에요.</span><button id="shop-reload" class="btn mini" hidden>저장 다시 읽기</button></footer></div></div>';
    get('app').append(this.dialog);
    get('shop-open').addEventListener('click',()=>this.open());
    get('shop-close').addEventListener('click',()=>this.dialog.close());
    get('shop-markers').addEventListener('click',()=>this.selectKind('marker'));
    get('shop-colors').addEventListener('click',()=>this.selectKind('marker-color'));
    get('shop-owned').addEventListener('click',()=>{this.ownedOnly=!this.ownedOnly;this.render();});
    get('shop-action').addEventListener('click',()=>void this.act());
    get('shop-reload').addEventListener('click',()=>void this.refresh());
    for(const category of ['ALL',...MARKER_CATEGORIES] as const){
      const button=document.createElement('button');button.className='chip';button.textContent=category==='ALL'?'전체':CATEGORY_LABELS[category];
      button.dataset.category=category;button.setAttribute('aria-pressed',String(category==='ALL'));
      button.addEventListener('click',()=>{this.category=category;this.render();});get('shop-categories').append(button);
    }
  }
  setProfile(p:PlayerProfileV1):void {this.profile=structuredClone(p);get('shop-reload').hidden=true;if(this.dialog.open)this.render();}
  open():void {
    if(!this.canOpen()||this.dialog.open)return;
    this.kind='marker';this.category='ALL';this.ownedOnly=false;this.selected=this.profile?.inventory.equippedMarkerId??DEFAULT_MARKER_ID;
    this.status('가격은 테스트 값이에요.');this.dialog.showModal();this.render();void this.refresh();
  }
  private async refresh():Promise<void>{
    try{const p=await this.store.read();this.loaded(p);}
    catch{this.status('저장소를 읽지 못했어요. 구매·장착을 진행할 수 없어요.',true);get('shop-reload').hidden=false;this.profile=null;this.render();}
  }
  private selectKind(kind:ProductKind):void {
    this.kind=kind;this.selected=this.profile?equippedItem(this.profile,kind):kind==='marker'?DEFAULT_MARKER_ID:DEFAULT_MARKER_COLOR_ID;this.render();
  }
  private appearance(id:string):MarkerAppearance {
    const equipped=this.profile?.inventory??{equippedMarkerId:DEFAULT_MARKER_ID,equippedMarkerColorId:DEFAULT_MARKER_COLOR_ID};
    return{markerId:this.kind==='marker'?id:equipped.equippedMarkerId,markerColorId:this.kind==='marker-color'?id:equipped.equippedMarkerColorId};
  }
  private render():void {
    get('shop-coins').textContent=this.profile?this.profile.coins.toLocaleString():'…';
    get('shop-markers').setAttribute('aria-pressed',String(this.kind==='marker'));get('shop-colors').setAttribute('aria-pressed',String(this.kind==='marker-color'));
    get('shop-owned').setAttribute('aria-pressed',String(this.ownedOnly));get('shop-categories').hidden=this.kind!=='marker';
    for(const button of get('shop-categories').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.category===this.category));
    const products=(this.kind==='marker'?MARKERS:MARKER_COLORS).filter(p=>(this.kind!=='marker'||this.category==='ALL'||('category'in p&&p.category===this.category))&&(!this.ownedOnly||!!this.profile&&ownedItem(this.profile,this.kind,p.id)));
    if(!products.some(p=>p.id===this.selected))this.selected=products[0]?.id??'';
    const list=get('shop-items'),focusId=(document.activeElement as HTMLElement|null)?.dataset.productId;list.replaceChildren();
    for(const product of products){
      const card=document.createElement('button');card.className='shop-card';card.dataset.productId=product.id;card.dataset.productKind=this.kind;
      card.setAttribute('aria-pressed',String(product.id===this.selected));
      if(this.kind==='marker-color'){
       const swatch=document.createElement('i');swatch.className='shop-color-swatch';swatch.setAttribute('aria-hidden','true');const value='value'in product?product.value:null;swatch.style.backgroundColor=cssHex(styledColor(value??this.slotColor));card.append(swatch);
      }else card.append(markerPreview(this.appearance(product.id),this.slotColor));
      const name=document.createElement('strong');name.textContent=product.name;card.append(name);
      const state=document.createElement('small'),owned=!!this.profile&&ownedItem(this.profile,this.kind,product.id),equipped=owned&&equippedItem(this.profile!,this.kind)===product.id;
      state.className='state '+(equipped?'equipped':owned?'owned':'price');state.textContent=equipped?'장착 중':owned?'보유 중':product.price+' 코인';card.append(state);
      card.addEventListener('click',()=>{this.selected=product.id;this.render();});list.append(card);
    }
    if(focusId)Array.from(list.querySelectorAll<HTMLElement>('[data-product-id]')).find(b=>b.dataset.productId===focusId)?.focus({preventScroll:true});
    const product=productDefinition(this.kind,this.selected),action=get<HTMLButtonElement>('shop-action');action.disabled=true;action.classList.add('sun');get('shop-preview').replaceChildren();
    if(!product){get('shop-item-name').textContent='상품 없음';get('shop-item-note').textContent='다른 카테고리나 보유 필터를 골라 보세요.';action.textContent='선택할 상품 없음';return;}
    get('shop-preview').append(markerPreview(this.appearance(product.id),this.slotColor));get('shop-item-name').textContent=product.name;
    get('shop-item-note').textContent=this.kind==='marker-color'?'마커 · 영토 · 꼬리에 모두 적용돼요':('category'in product&&product.category==='SPECIAL')?'게임 중에 움직여요 · 몸통에 내 색상':'몸통에 내 색상이 칠해져요';
    if(this.pending){action.textContent='저장 중…';return;}
    if(!this.profile){action.textContent='저장소 확인 필요';return;}
    const owned=ownedItem(this.profile,this.kind,product.id),equipped=equippedItem(this.profile,this.kind)===product.id;
    action.textContent=owned?(equipped?'장착 중':'장착'):this.profile.coins<product.price?'코인이 부족해요':'구매 · '+product.price+' 코인';
    action.classList.toggle('sun',!owned);
    action.disabled=owned?equipped:this.profile.coins<product.price;
  }
  private status(text:string,error=false):void {get('shop-status').textContent=text;get('shop-status').classList.toggle('shop-error',error);}
  private async act():Promise<void>{
    if(this.pending||!this.profile||!this.selected)return;
    const kind=this.kind,id=this.selected,owned=ownedItem(this.profile,kind,id),name=productDefinition(kind,id)?.name??id;
    this.pending=true;this.status('저장 중…');this.render();
    try{
      const receipt=await(owned?this.store.equip(kind,id):this.store.purchase(kind,id));
      const messages:Record<ShopReceipt['status'],string>={purchased:name+' 구매 완료. 장착할 수 있어요.',owned:'이미 보유 중이에요. 코인을 쓰지 않았어요.',insufficient:'코인이 부족해요.',equipped:name+' 장착 완료.', 'already-equipped':'이미 장착 중이에요.','not-owned':'먼저 상품을 구매하세요.',unknown:'상품 정보를 찾지 못했어요.'};
      this.status(messages[receipt.status],['insufficient','not-owned','unknown'].includes(receipt.status));
    }catch{this.status('저장 실패. 코인과 구매·장착 상태는 바뀌지 않았어요. 다시 눌러 주세요.',true);}
    finally{this.pending=false;this.render();}
  }
}

export const MARKER_CATEGORIES=['BASIC','CUTE','FANTASY','TECH','SPECIAL'] as const;
export const CATEGORY_LABELS:Readonly<Record<typeof MARKER_CATEGORIES[number],string>>={BASIC:'기본',CUTE:'귀여움',FANTASY:'판타지',TECH:'테크',SPECIAL:'스페셜'};
export type MarkerCategory=typeof MARKER_CATEGORIES[number];
export type MarkerShape='DEFAULT'|'RING'|'HEX'|'TARGET'|'PLACEHOLDER';
export type ProductKind='marker'|'marker-color';
export interface MarkerDefinition {
  id:string;name:string;category:MarkerCategory;price:number;
  renderType:'GEOMETRY'|'IMAGE';shape:MarkerShape;assetKey?:string;detailAssetKey?:string;
  placeholder?:boolean;shortLabel?:string;
}
export interface MarkerColorDefinition {id:string;name:string;value:number|null;price:number}
export const DEFAULT_MARKER_ID='default',DEFAULT_MARKER_COLOR_ID='slot';
// Temporary V1 prices. All prices live here, independent of storage and renderers.
export const SHOP_PRICES=Object.freeze({ring:40,hex:60,target:80,placeholder:50,imageMarker:50,markerColor:30});
export const MARKERS:readonly Readonly<MarkerDefinition>[]=Object.freeze([
  {id:'default',name:'기본 원',category:'BASIC',price:0,renderType:'GEOMETRY',shape:'DEFAULT'},
  {id:'ring',name:'링',category:'BASIC',price:SHOP_PRICES.ring,renderType:'GEOMETRY',shape:'RING'},
  {id:'hex',name:'육각',category:'BASIC',price:SHOP_PRICES.hex,renderType:'GEOMETRY',shape:'HEX'},
  {id:'target',name:'타깃',category:'BASIC',price:SHOP_PRICES.target,renderType:'GEOMETRY',shape:'TARGET'},
  {id:'cat',name:'말랑냥',category:'CUTE',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-cat-base',detailAssetKey:'marker-cat-detail'},
  {id:'chick',name:'콩병아리',category:'CUTE',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-chick-base',detailAssetKey:'marker-chick-detail'},
  {id:'slime',name:'젤리팡',category:'CUTE',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-slime-base',detailAssetKey:'marker-slime-detail'},
  {id:'crystal',name:'루미 크리스탈',category:'FANTASY',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-crystal-base',detailAssetKey:'marker-crystal-detail'},
  {id:'ghost',name:'꼬마 유령',category:'FANTASY',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-ghost-base',detailAssetKey:'marker-ghost-detail'},
  {id:'core',name:'캡슐 코어',category:'TECH',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-core-base',detailAssetKey:'marker-core-detail'},
  {id:'radar',name:'접시 레이더',category:'TECH',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-radar-base',detailAssetKey:'marker-radar-detail'},
  {id:'drone',name:'포켓 드론',category:'TECH',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-drone-base',detailAssetKey:'marker-drone-detail'},
  {id:'orbit',name:'궤도 정령',category:'SPECIAL',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-orbit-base',detailAssetKey:'marker-orbit-detail'},
  {id:'crown',name:'왕관 수호자',category:'SPECIAL',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-crown-base',detailAssetKey:'marker-crown-detail'},
  {id:'ember',name:'불씨 정령',category:'SPECIAL',price:SHOP_PRICES.imageMarker,renderType:'IMAGE',shape:'PLACEHOLDER',assetKey:'marker-ember-base',detailAssetKey:'marker-ember-detail'}
].map(d=>Object.freeze(d as MarkerDefinition)));
export const MARKER_COLORS:readonly Readonly<MarkerColorDefinition>[]=Object.freeze([
  {id:'slot',name:'내 기본색',value:null,price:0},
  {id:'coral',name:'코랄',value:0xff7084,price:SHOP_PRICES.markerColor},
  {id:'violet',name:'바이올렛',value:0xa180f4,price:SHOP_PRICES.markerColor},
  {id:'cyan',name:'시안',value:0x59bfd8,price:SHOP_PRICES.markerColor},
  {id:'gold',name:'골드',value:0xffb43b,price:SHOP_PRICES.markerColor},
  {id:'red',name:'레드',value:0xc83f4b,price:SHOP_PRICES.markerColor},
  {id:'orange',name:'오렌지',value:0xe87325,price:SHOP_PRICES.markerColor},
  {id:'lime',name:'라임',value:0xb5ce50,price:SHOP_PRICES.markerColor},
  {id:'green',name:'그린',value:0x36843f,price:SHOP_PRICES.markerColor},
  {id:'mint',name:'민트',value:0x16cdb1,price:SHOP_PRICES.markerColor},
  {id:'teal',name:'틸',value:0x147f84,price:SHOP_PRICES.markerColor},
  {id:'sky',name:'스카이',value:0x359aff,price:SHOP_PRICES.markerColor},
  {id:'blue',name:'블루',value:0x254bc8,price:SHOP_PRICES.markerColor},
  {id:'pink',name:'핑크',value:0xdc57bd,price:SHOP_PRICES.markerColor},
  {id:'plum',name:'플럼',value:0x763782,price:SHOP_PRICES.markerColor},
  {id:'brown',name:'브라운',value:0x9b644d,price:SHOP_PRICES.markerColor},
  {id:'slate',name:'슬레이트',value:0x52687c,price:SHOP_PRICES.markerColor}
].map(d=>Object.freeze(d)));
const markers=new Map(MARKERS.map(d=>[d.id,d])),colors=new Map(MARKER_COLORS.map(d=>[d.id,d]));
export const markerDefinition=(id:string)=>markers.get(id);
export const markerColorDefinition=(id:string)=>colors.get(id);
export const productDefinition=(kind:ProductKind,id:string)=>kind==='marker'?markers.get(id):kind==='marker-color'?colors.get(id):undefined;

export function markerAssetUrl(key:string):string{return "/assets/markers/"+key.replace(/^marker-/,"")+".png";}

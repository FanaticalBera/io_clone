export const MARKER_CATEGORIES=['BASIC','CUTE','FANTASY','TECH','SPECIAL'] as const;
export const CATEGORY_LABELS:Readonly<Record<typeof MARKER_CATEGORIES[number],string>>={BASIC:'기본',CUTE:'귀여움',FANTASY:'판타지',TECH:'테크',SPECIAL:'스페셜'};
export type MarkerCategory=typeof MARKER_CATEGORIES[number];
export type ProductKind='marker'|'marker-color';
export interface MarkerDefinition {id:string;name:string;category:MarkerCategory;price:number}
export interface MarkerColorDefinition {id:string;name:string;value:number|null;price:number}
export const DEFAULT_MARKER_ID='default',DEFAULT_MARKER_COLOR_ID='slot';
// Temporary V1 prices. All prices live here, independent of storage and renderers.
export const SHOP_PRICES=Object.freeze({ring:40,hex:60,target:80,imageMarker:50,markerColor:30});
// Every marker is vector art in marker-shapes.ts under the same id.
export const MARKERS:readonly Readonly<MarkerDefinition>[]=Object.freeze([
  {id:'default',name:'기본 원',category:'BASIC',price:0},
  {id:'ring',name:'링',category:'BASIC',price:SHOP_PRICES.ring},
  {id:'hex',name:'육각',category:'BASIC',price:SHOP_PRICES.hex},
  {id:'target',name:'타깃',category:'BASIC',price:SHOP_PRICES.target},
  {id:'star',name:'별 말',category:'BASIC',price:SHOP_PRICES.imageMarker},
  {id:'pawn',name:'체스 폰',category:'BASIC',price:SHOP_PRICES.imageMarker},
  {id:'dice',name:'주사위',category:'BASIC',price:SHOP_PRICES.imageMarker},
  {id:'shield',name:'방패',category:'BASIC',price:SHOP_PRICES.imageMarker},
  {id:'cat',name:'말랑냥',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'chick',name:'콩병아리',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'slime',name:'젤리팡',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'bunny',name:'몽실토끼',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'penguin',name:'뒤뚱펭귄',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'frog',name:'개굴이',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'bear',name:'곰돌찐빵',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'octopus',name:'문어빵',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'crystal',name:'루미 크리스탈',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'ghost',name:'꼬마 유령',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'dragon',name:'꼬마 드래곤',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'potion',name:'별빛 물약',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'wizard',name:'마법사 모자',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'mushroom',name:'버섯돌이',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'orb',name:'점술 구슬',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'egg',name:'용의 알',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'core',name:'캡슐 코어',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'radar',name:'접시 레이더',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'drone',name:'포켓 드론',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'robot',name:'깡통봇',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'rocket',name:'꼬마 로켓',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'ufo',name:'비행접시',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'gamepad',name:'게임패드',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'bulb',name:'반짝 전구',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'orbit',name:'궤도 정령',category:'SPECIAL',price:SHOP_PRICES.imageMarker},
  {id:'crown',name:'왕관 수호자',category:'SPECIAL',price:SHOP_PRICES.imageMarker},
  {id:'ember',name:'불씨 정령',category:'SPECIAL',price:SHOP_PRICES.imageMarker},
  {id:'meteor',name:'별똥별',category:'SPECIAL',price:SHOP_PRICES.imageMarker},
  {id:'portal',name:'소용돌이',category:'SPECIAL',price:SHOP_PRICES.imageMarker},
  {id:'sun',name:'해님',category:'SPECIAL',price:SHOP_PRICES.imageMarker},
  {id:'heart',name:'두근 하트',category:'SPECIAL',price:SHOP_PRICES.imageMarker},
  {id:'storm',name:'번개 구름',category:'SPECIAL',price:SHOP_PRICES.imageMarker}
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


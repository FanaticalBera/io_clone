export const MARKER_CATEGORIES=['BASIC','CUTE','FANTASY','TECH','SPECIAL'] as const;
export const CATEGORY_LABELS:Readonly<Record<typeof MARKER_CATEGORIES[number],string>>={BASIC:'기본',CUTE:'귀여움',FANTASY:'판타지',TECH:'테크',SPECIAL:'스페셜'};
export type MarkerCategory=typeof MARKER_CATEGORIES[number];
export type ProductKind='marker'|'marker-color';
/** reward: never sold; granted when every sold marker of that category (or ALL) is owned. */
export interface MarkerDefinition {id:string;name:string;category:MarkerCategory;price:number;legendary?:boolean;reward?:MarkerCategory|'ALL'}
export interface MarkerColorDefinition {id:string;name:string;value:number|null;price:number}
export const DEFAULT_MARKER_ID='default',DEFAULT_MARKER_COLOR_ID='slot';
// Launch prices. Owned items and collection rewards remain available without another purchase.
export const SHOP_PRICES=Object.freeze({basicMarker:250,imageMarker:600,specialMarker:1200,legendaryMarker:2250,markerColor:100});
// Every marker is vector art in marker-shapes.ts under the same id.
export const MARKERS:readonly Readonly<MarkerDefinition>[]=Object.freeze([
  {id:'default',name:'기본 원',category:'BASIC',price:0},
  {id:'ring',name:'링',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'hex',name:'육각',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'target',name:'타깃',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'star',name:'별 말',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'pawn',name:'체스 폰',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'dice',name:'주사위',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'shield',name:'방패',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'puzzle',name:'퍼즐 조각',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'rook',name:'체스 룩',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'king',name:'체스 킹',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'clover',name:'네잎 클로버',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'card',name:'스페이드 카드',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'domino',name:'도미노',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'coin',name:'행운 동전',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'arrow',name:'화살표 말',category:'BASIC',price:SHOP_PRICES.basicMarker},
  {id:'cat',name:'말랑냥',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'chick',name:'콩병아리',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'slime',name:'젤리팡',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'bunny',name:'몽실토끼',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'penguin',name:'뒤뚱펭귄',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'frog',name:'개굴이',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'bear',name:'곰돌찐빵',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'octopus',name:'문어빵',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'hamster',name:'볼빵빵 햄스터',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'duckling',name:'꽥꽥이',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'panda',name:'판다곰',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'fox',name:'꼬리여우',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'pig',name:'꿀꿀이',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'dog',name:'멍뭉이',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'whale',name:'아기고래',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'turtle',name:'엉금거북',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'jellyfish',name:'해파리',category:'CUTE',price:SHOP_PRICES.imageMarker},
  {id:'crystal',name:'루미 크리스탈',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'ghost',name:'꼬마 유령',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'dragon',name:'꼬마 드래곤',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'potion',name:'별빛 물약',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'wizard',name:'마법사 모자',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'mushroom',name:'버섯돌이',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'orb',name:'점술 구슬',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'egg',name:'용의 알',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'unicorn',name:'꼬마 유니콘',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'mimic',name:'보물 미믹',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'book',name:'마법서',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'lamp',name:'요술 램프',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'tower',name:'마법사의 탑',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'sword',name:'전설의 검',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'bat',name:'박쥐',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'pumpkin',name:'호박 등불',category:'FANTASY',price:SHOP_PRICES.imageMarker},
  {id:'core',name:'캡슐 코어',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'radar',name:'접시 레이더',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'drone',name:'포켓 드론',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'robot',name:'깡통봇',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'rocket',name:'꼬마 로켓',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'ufo',name:'비행접시',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'gamepad',name:'게임패드',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'bulb',name:'반짝 전구',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'gear',name:'톱니바퀴',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'battery',name:'배터리',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'magnet',name:'자석',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'camera',name:'카메라',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'satellite',name:'인공위성',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'submarine',name:'잠수함',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'tv',name:'레트로 TV',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'headphones',name:'헤드폰',category:'TECH',price:SHOP_PRICES.imageMarker},
  {id:'orbit',name:'궤도 정령',category:'SPECIAL',price:SHOP_PRICES.specialMarker},
  {id:'crown',name:'왕관 수호자',category:'SPECIAL',price:SHOP_PRICES.specialMarker},
  {id:'ember',name:'불씨 정령',category:'SPECIAL',price:SHOP_PRICES.specialMarker},
  {id:'meteor',name:'별똥별',category:'SPECIAL',price:SHOP_PRICES.specialMarker},
  {id:'portal',name:'소용돌이',category:'SPECIAL',price:SHOP_PRICES.specialMarker},
  {id:'sun',name:'해님',category:'SPECIAL',price:SHOP_PRICES.specialMarker},
  {id:'heart',name:'두근 하트',category:'SPECIAL',price:SHOP_PRICES.specialMarker},
  {id:'storm',name:'번개 구름',category:'SPECIAL',price:SHOP_PRICES.specialMarker},
  {id:'phoenix',name:'불사조',category:'SPECIAL',price:SHOP_PRICES.legendaryMarker,legendary:true},
  {id:'blackhole',name:'블랙홀',category:'SPECIAL',price:SHOP_PRICES.legendaryMarker,legendary:true},
  {id:'rainbow',name:'무지개',category:'SPECIAL',price:SHOP_PRICES.legendaryMarker,legendary:true},
  {id:'snowflake',name:'눈송이',category:'SPECIAL',price:SHOP_PRICES.legendaryMarker,legendary:true},
  {id:'sakura',name:'벚꽃',category:'SPECIAL',price:SHOP_PRICES.legendaryMarker,legendary:true},
  {id:'kingslime',name:'킹 슬라임',category:'SPECIAL',price:SHOP_PRICES.legendaryMarker,legendary:true},
  {id:'diamond',name:'다이아몬드',category:'SPECIAL',price:SHOP_PRICES.legendaryMarker,legendary:true},
  {id:'golddragon',name:'황금 드래곤',category:'SPECIAL',price:SHOP_PRICES.legendaryMarker,legendary:true},
  {id:'goldpuck',name:'황금 왕관 말',category:'BASIC',price:0,legendary:true,reward:'BASIC'},
  {id:'crowncat',name:'왕관 말랑냥',category:'CUTE',price:0,legendary:true,reward:'CUTE'},
  {id:'archmage',name:'대마법사의 구슬',category:'FANTASY',price:0,legendary:true,reward:'FANTASY'},
  {id:'goldbot',name:'황금 로봇',category:'TECH',price:0,legendary:true,reward:'TECH'},
  {id:'starwhale',name:'별고래',category:'SPECIAL',price:0,legendary:true,reward:'SPECIAL'},
  {id:'hexcrown',name:'헥스홀드 왕관',category:'SPECIAL',price:0,legendary:true,reward:'ALL'}
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
  {id:'mint',name:'민트',value:0x80dbc0,price:SHOP_PRICES.markerColor},
  {id:'teal',name:'틸',value:0x147f84,price:SHOP_PRICES.markerColor},
  {id:'sky',name:'스카이',value:0x359aff,price:SHOP_PRICES.markerColor},
  {id:'blue',name:'블루',value:0x254bc8,price:SHOP_PRICES.markerColor},
  {id:'pink',name:'핑크',value:0xdc57bd,price:SHOP_PRICES.markerColor},
  {id:'plum',name:'플럼',value:0x763782,price:SHOP_PRICES.markerColor},
  {id:'brown',name:'브라운',value:0x9b644d,price:SHOP_PRICES.markerColor},
  {id:'slate',name:'슬레이트',value:0x52687c,price:SHOP_PRICES.markerColor},
  {id:'scarlet',name:'스칼렛',value:0xe24c39,price:SHOP_PRICES.markerColor},
  {id:'salmon',name:'살몬',value:0xf58c84,price:SHOP_PRICES.markerColor},
  {id:'apricot',name:'살구',value:0xf2a368,price:SHOP_PRICES.markerColor},
  {id:'amber',name:'앰버',value:0xd88e24,price:SHOP_PRICES.markerColor},
  {id:'lemon',name:'레몬',value:0xd9c840,price:SHOP_PRICES.markerColor},
  {id:'emerald',name:'에메랄드',value:0x2caa72,price:SHOP_PRICES.markerColor},
  {id:'cream',name:'크림',value:0xd8c190,price:SHOP_PRICES.markerColor},
  {id:'graphite',name:'그라파이트',value:0x68737d,price:SHOP_PRICES.markerColor},
  {id:'turquoise',name:'터쿼이즈',value:0x29a7b8,price:SHOP_PRICES.markerColor},
  {id:'ice',name:'아이스 블루',value:0x82b5d7,price:SHOP_PRICES.markerColor},
  {id:'indigo',name:'인디고',value:0x6658b5,price:SHOP_PRICES.markerColor},
  {id:'lavender',name:'라벤더',value:0xb397df,price:SHOP_PRICES.markerColor},
  {id:'rose',name:'로즈',value:0xb96a90,price:SHOP_PRICES.markerColor},
  {id:'wine',name:'와인',value:0xa34864,price:SHOP_PRICES.markerColor},
  {id:'mauve',name:'모브',value:0xa46baf,price:SHOP_PRICES.markerColor},
  {id:'copper',name:'코퍼',value:0xb57b54,price:SHOP_PRICES.markerColor}
].map(d=>Object.freeze(d)));
const markers=new Map(MARKERS.map(d=>[d.id,d])),colors=new Map(MARKER_COLORS.map(d=>[d.id,d]));
export const markerDefinition=(id:string)=>markers.get(id);
export const SOLD_MARKERS=MARKERS.filter(m=>!m.reward);
/** Reward markers the owned set has earned but not yet received. */
export function earnedRewards(owned:readonly string[]):string[]{
 const have=new Set(owned),done=(c:MarkerCategory|'ALL')=>SOLD_MARKERS.every(m=>(c==='ALL'||m.category===c)?have.has(m.id):true);
 return MARKERS.filter(m=>m.reward&&!have.has(m.id)&&done(m.reward)).map(m=>m.id);
}
export const markerColorDefinition=(id:string)=>colors.get(id);
export const productDefinition=(kind:ProductKind,id:string)=>kind==='marker'?markers.get(id):kind==='marker-color'?colors.get(id):undefined;

/** Collection sets: owning every member earns the title shown in the marker book. */
export interface MarkerSet {id:string;name:string;title:string;ids:readonly string[]}
export const MARKER_SETS:readonly Readonly<MarkerSet>[]=Object.freeze([
 {id:'chess',name:'체스 세트',title:'체스 마스터',ids:['pawn','rook','king']},
 {id:'luck',name:'행운 세트',title:'행운아',ids:['clover','coin','card','dice']},
 {id:'farm',name:'농장 친구들',title:'농장 주인',ids:['chick','duckling','pig','bunny']},
 {id:'sea',name:'바다 친구들',title:'바다 탐험가',ids:['octopus','whale','jellyfish','submarine']},
 {id:'halloween',name:'할로윈',title:'할로윈 대장',ids:['bat','pumpkin','ghost','mimic']},
 {id:'magic',name:'마법 학교',title:'마법 학도',ids:['wizard','book','orb','potion']},
 {id:'space',name:'우주 여행',title:'우주 비행사',ids:['rocket','ufo','satellite','meteor']},
 {id:'seasons',name:'사계절',title:'사계절 여행자',ids:['sakura','sun','snowflake','rainbow']}
].map(s=>Object.freeze(s)));
export const earnedTitles=(owned:readonly string[])=>{const have=new Set(owned);return MARKER_SETS.filter(s=>s.ids.every(id=>have.has(id))).map(s=>s.title);};

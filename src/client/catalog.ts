export const MARKER_CATEGORIES=['BASIC','CUTE','FANTASY','TECH','SPECIAL'] as const;
export type MarkerCategory=typeof MARKER_CATEGORIES[number];
export type MarkerShape='DEFAULT'|'RING'|'HEX'|'TARGET'|'PLACEHOLDER';
export type ProductKind='marker'|'marker-color';
export interface MarkerDefinition {
  id:string;name:string;category:MarkerCategory;price:number;
  renderType:'GEOMETRY'|'IMAGE';shape:MarkerShape;assetKey?:string;
  placeholder?:boolean;shortLabel?:string;
}
export interface MarkerColorDefinition {id:string;name:string;value:number|null;price:number}
export const DEFAULT_MARKER_ID='default',DEFAULT_MARKER_COLOR_ID='slot';
// Temporary V1 prices. All prices live here, independent of storage and renderers.
export const SHOP_PRICES=Object.freeze({ring:40,hex:60,target:80,placeholder:50,markerColor:30});
export const MARKERS:readonly Readonly<MarkerDefinition>[]=Object.freeze([
  {id:'default',name:'Default',category:'BASIC',price:0,renderType:'GEOMETRY',shape:'DEFAULT'},
  {id:'ring',name:'Ring',category:'BASIC',price:SHOP_PRICES.ring,renderType:'GEOMETRY',shape:'RING'},
  {id:'hex',name:'Hex',category:'BASIC',price:SHOP_PRICES.hex,renderType:'GEOMETRY',shape:'HEX'},
  {id:'target',name:'Target',category:'BASIC',price:SHOP_PRICES.target,renderType:'GEOMETRY',shape:'TARGET'},
  {id:'cat',name:'Cat',category:'CUTE',price:SHOP_PRICES.placeholder,renderType:'GEOMETRY',shape:'PLACEHOLDER',placeholder:true,shortLabel:'CT'},
  {id:'slime',name:'Slime',category:'CUTE',price:SHOP_PRICES.placeholder,renderType:'GEOMETRY',shape:'PLACEHOLDER',placeholder:true,shortLabel:'SL'},
  {id:'crystal',name:'Crystal',category:'FANTASY',price:SHOP_PRICES.placeholder,renderType:'GEOMETRY',shape:'PLACEHOLDER',placeholder:true,shortLabel:'CR'},
  {id:'core',name:'Core',category:'TECH',price:SHOP_PRICES.placeholder,renderType:'GEOMETRY',shape:'PLACEHOLDER',placeholder:true,shortLabel:'CO'},
  {id:'orbit',name:'Orbit',category:'SPECIAL',price:SHOP_PRICES.placeholder,renderType:'GEOMETRY',shape:'PLACEHOLDER',placeholder:true,shortLabel:'SP'}
].map(d=>Object.freeze(d as MarkerDefinition)));
export const MARKER_COLORS:readonly Readonly<MarkerColorDefinition>[]=Object.freeze([
  {id:'slot',name:'슬롯 기본',value:null,price:0},
  {id:'coral',name:'Coral',value:0xff7084,price:SHOP_PRICES.markerColor},
  {id:'violet',name:'Violet',value:0xa180f4,price:SHOP_PRICES.markerColor},
  {id:'cyan',name:'Cyan',value:0x59bfd8,price:SHOP_PRICES.markerColor},
  {id:'gold',name:'Gold',value:0xffb43b,price:SHOP_PRICES.markerColor}
].map(d=>Object.freeze(d)));
const markers=new Map(MARKERS.map(d=>[d.id,d])),colors=new Map(MARKER_COLORS.map(d=>[d.id,d]));
export const markerDefinition=(id:string)=>markers.get(id);
export const markerColorDefinition=(id:string)=>colors.get(id);
export const productDefinition=(kind:ProductKind,id:string)=>kind==='marker'?markers.get(id):kind==='marker-color'?colors.get(id):undefined;

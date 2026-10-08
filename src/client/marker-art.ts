import {contrastBasicPrimitives} from './basic-marker-art.js';
import {imageMarkerPreview} from './marker-preview-image.js';
import {styledColor} from './player-colors.js';
import {markerDefinition,markerColorDefinition,DEFAULT_MARKER_ID,DEFAULT_MARKER_COLOR_ID,type MarkerDefinition} from './catalog.js';
export interface MarkerAppearance {markerId:string;markerColorId:string}
export type MarkerPrimitive=
  |{kind:'circle';x:number;y:number;radius:number;fill?:number;stroke?:number;width?:number;tag?:'IDENTIFICATION'}
  |{kind:'polygon';points:{x:number;y:number}[];fill?:number;stroke?:number;width?:number}
  |{kind:'line';x1:number;y1:number;x2:number;y2:number;stroke:number;width:number};
export interface MarkerArt {definition:Readonly<MarkerDefinition>;markerId:string;markerColorId:string;bodyColor:number;slotColor:number;local:boolean;primitives:MarkerPrimitive[];label:string}
export const DEFAULT_MARKER_APPEARANCE:Readonly<MarkerAppearance>=Object.freeze({markerId:DEFAULT_MARKER_ID,markerColorId:DEFAULT_MARKER_COLOR_ID});
export function markerArt(appearance:MarkerAppearance,slotColor:number,local:boolean,allowRemoteAppearance=false):MarkerArt {
  const definition=markerDefinition(local||allowRemoteAppearance?appearance.markerId:DEFAULT_MARKER_ID)??markerDefinition(DEFAULT_MARKER_ID)!;
  const color=markerColorDefinition(local||allowRemoteAppearance?appearance.markerColorId:DEFAULT_MARKER_COLOR_ID)??markerColorDefinition(DEFAULT_MARKER_COLOR_ID)!;
  const bodyColor=styledColor(color.value??slotColor),primitives:MarkerPrimitive[]=[];
  const circle=(radius:number,fill?:number,stroke?:number,width=0)=>primitives.push({kind:'circle',x:0,y:0,radius,fill,stroke,width});
  switch(definition.shape){
    case 'DEFAULT':circle(21,bodyColor,0xffffff,5);break;
    case 'RING':primitives.push(...contrastBasicPrimitives('RING',bodyColor));break;
    case 'HEX':primitives.push({kind:'polygon',points:Array.from({length:6},(_,i)=>({x:21*Math.cos(i*Math.PI/3-Math.PI/2),y:21*Math.sin(i*Math.PI/3-Math.PI/2)})),fill:bodyColor,stroke:0xffffff,width:3});break;
    case 'TARGET':primitives.push(...contrastBasicPrimitives('TARGET',bodyColor));break;
    case 'PLACEHOLDER':circle(19,bodyColor,0xffffff,3);break;
  }
  if(local||allowRemoteAppearance)primitives.push({kind:'circle',x:0,y:0,radius:25.5,stroke:slotColor,width:2,tag:'IDENTIFICATION'});
  return{definition,markerId:definition.id,markerColorId:color.id,bodyColor,slotColor,local,primitives,label:definition.placeholder?(definition.shortLabel??'?'):''};
}
export const markerCssColor=(color:number)=>'#'+color.toString(16).padStart(6,'0');
export function markerPreview(appearance:MarkerAppearance,slotColor:number):SVGSVGElement|HTMLCanvasElement {
  const renderColor=styledColor(markerColorDefinition(appearance.markerColorId)?.value??slotColor);
  const art=markerArt(appearance,renderColor,true);
  if(art.definition.renderType==='IMAGE'&&art.definition.assetKey)return imageMarkerPreview(art.definition,art.bodyColor,art.slotColor);
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','-32 -32 64 64');svg.setAttribute('aria-hidden','true');
  for(const p of art.primitives){
    const el=document.createElementNS(ns,p.kind==='polygon'?'polygon':p.kind==='line'?'line':'circle');
    if(p.kind==='circle'){el.setAttribute('cx',String(p.x));el.setAttribute('cy',String(p.y));el.setAttribute('r',String(p.radius));}
    else if(p.kind==='polygon')el.setAttribute('points',p.points.map(v=>v.x+','+v.y).join(' '));
    else for(const k of ['x1','y1','x2','y2'] as const)el.setAttribute(k,String(p[k]));
    el.setAttribute('fill','fill'in p&&p.fill!==undefined?markerCssColor(p.fill):'none');
    if(p.stroke!==undefined){el.setAttribute('stroke',markerCssColor(p.stroke));el.setAttribute('stroke-width',String(p.width??1));}
    svg.append(el);
  }
  if(art.label){const label=document.createElementNS(ns,'text');label.setAttribute('text-anchor','middle');label.setAttribute('dominant-baseline','central');label.setAttribute('font-size','12');label.setAttribute('font-family','Arial,sans-serif');label.setAttribute('font-weight','bold');label.setAttribute('fill','#ffffff');label.textContent=art.label;svg.append(label);}
  return svg;
}

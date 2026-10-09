import {styledColor} from './player-colors.js';
import {markerSvg} from './marker-shapes.js';
import {markerDefinition,markerColorDefinition,DEFAULT_MARKER_ID,DEFAULT_MARKER_COLOR_ID,type MarkerDefinition} from './catalog.js';
export interface MarkerAppearance {markerId:string;markerColorId:string}
export interface MarkerArt {definition:Readonly<MarkerDefinition>;markerId:string;markerColorId:string;bodyColor:number;slotColor:number;local:boolean}
export const DEFAULT_MARKER_APPEARANCE:Readonly<MarkerAppearance>=Object.freeze({markerId:DEFAULT_MARKER_ID,markerColorId:DEFAULT_MARKER_COLOR_ID});
// Other humans always render the default marker in their slot colour; bots may show their cosmetics.
export function markerArt(appearance:MarkerAppearance,slotColor:number,local:boolean,allowRemoteAppearance=false):MarkerArt {
  const definition=markerDefinition(local||allowRemoteAppearance?appearance.markerId:DEFAULT_MARKER_ID)??markerDefinition(DEFAULT_MARKER_ID)!;
  const color=markerColorDefinition(local||allowRemoteAppearance?appearance.markerColorId:DEFAULT_MARKER_COLOR_ID)??markerColorDefinition(DEFAULT_MARKER_COLOR_ID)!;
  return {definition,markerId:definition.id,markerColorId:color.id,bodyColor:styledColor(color.value??slotColor),slotColor,local};
}
export const markerCssColor=(color:number)=>'#'+color.toString(16).padStart(6,'0');
export function markerPreview(appearance:MarkerAppearance,slotColor:number):SVGSVGElement {
  const art=markerArt(appearance,styledColor(markerColorDefinition(appearance.markerColorId)?.value??slotColor),true);
  // The markup is built only from catalog constants and numeric colours.
  const svg=new DOMParser().parseFromString(markerSvg(art.markerId,art.bodyColor,64,true),'image/svg+xml').documentElement as unknown as SVGSVGElement;
  svg.removeAttribute('width');svg.removeAttribute('height');svg.setAttribute('aria-hidden','true');svg.dataset.markerId=art.markerId;
  return document.importNode(svg,true);
}

/**
 * Premium capture themes that colour the land itself instead of dropping
 * objects on it: the flip wave lights tiles in the theme, a light runs once
 * around the new border, and the marker gets one short ring. No particles.
 */
export interface CaptureTheme {
 /** Tile colour as the wave reaches it; order is the tile's 0..1 place in the wave, x/y its world centre. */
 tile:(order:number,x:number,y:number)=>number;
 /** Border colours for an edge at this angle around the capture origin. */
 edge:(angle:number)=>{line:number;core:number};
 /** The wave runs from the outside in (and the ring closes in) instead of outward. */
 inward?:boolean;
 ring:number;
}
const RAINBOW=[0xff5a5a,0xff9f1c,0xffd23f,0x46c46a,0x4ea8ff,0x9b6bff];
const hue=(t:number)=>{const f=((t%1)+1)%1*RAINBOW.length,i=Math.floor(f);return mix(RAINBOW[i],RAINBOW[(i+1)%RAINBOW.length],f-i);};
export function mix(a:number,b:number,t:number):number{
 const ch=(s:number)=>Math.round(((a>>>s)&255)*(1-t)+((b>>>s)&255)*t);return (ch(16)<<16)|(ch(8)<<8)|ch(0);
}
export const CAPTURE_THEMES:Readonly<Record<string,CaptureTheme>>={
 sun:{tile:o=>mix(0xfff6c0,0xffc93c,o),edge:()=>({line:0xff9f1c,core:0xfff6c0}),ring:0xffc93c},
 // Diagonal rainbow stripes, about one tile wide each.
 rainbow:{tile:(_o,x,y)=>RAINBOW[Math.floor(((x+y*.6)/70%RAINBOW.length+RAINBOW.length)%RAINBOW.length)],edge:a=>({line:hue(a/(Math.PI*2)),core:0xffffff}),ring:0xffffff},
 blackhole:{tile:o=>mix(0x2a1650,0x9b6bff,o),edge:()=>({line:0x6b3fd1,core:0xd8c8ff}),inward:true,ring:0x9b6bff},
};
/** Tiles hold the theme colour this long after flipping, then blend into the owner colour. */
export const THEME_HOLD=480;
/** Border light: one turn around the origin over SWEEP ms, fading out by THEME_END. */
export const THEME_SWEEP=700,THEME_END=950;
/** Fill colour and alpha for a tile `local` ms after the wave reached it, or null when done. */
export function themedTile(theme:CaptureTheme,order:number,x:number,y:number,local:number,owner:number):{color:number;alpha:number}|null{
 if(local<0||local>=THEME_HOLD)return null;const t=local/THEME_HOLD;
 // The colour stays crisp and fades out over the owner colour; blending hues would turn muddy.
 void owner;return {color:theme.tile(order,x,y),alpha:t<.5?1:1-(t-.5)/.5};
}
/** Edge brightness 0..1: a soft glow everywhere plus a bright head travelling around the origin. */
export function themedEdge(angle:number,elapsed:number):number{
 if(elapsed<0||elapsed>=THEME_END)return 0;
 const head=elapsed/THEME_SWEEP*Math.PI*2-Math.PI/2,gap=Math.abs(((angle-head)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI);
 const fade=elapsed<THEME_SWEEP?1:1-(elapsed-THEME_SWEEP)/(THEME_END-THEME_SWEEP);
 return fade*(.35+.65*Math.max(0,1-gap/1.1)**2);
}
/** Marker ring radius and alpha, opening out (or closing in) over RING ms. */
export const RING=420;
export function themedRing(theme:CaptureTheme,elapsed:number):{radius:number;alpha:number}|null{
 if(elapsed<0||elapsed>=RING)return null;const t=elapsed/RING;
 return {radius:theme.inward?96-70*t:26+70*t,alpha:1-t};
}

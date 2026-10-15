/**
 * Premium capture themes that colour the land itself instead of dropping
 * objects on it: the flip wave lights tiles in the theme, a light runs around
 * the new border, and the marker gets one short ring. No particles.
 * Special markers use one colour spreading outward; legendary and reward
 * markers add a pattern or a different wave shape.
 */
/** Where a tile sits in this capture: dist 0..1 outward, dx/dy from the origin, radius of the capture, seed 0..1 per tile. */
export interface TileSpot {dist:number;dx:number;dy:number;x:number;y:number;radius:number;seed:number}
export interface TileLook {color:number;alpha:number;pop?:number}
export interface CaptureTheme {
 /** Wave position 0..1 (when the tile flips); outward by distance unless set. */
 order?:(s:TileSpot)=>number;
 /** Look of a tile `local` ms after it flipped (t = local/THEME_HOLD), or null for no overlay. */
 tile:(s:TileSpot,t:number)=>TileLook|null;
 edge:(angle:number)=>{line:number;core:number};
 /** Bright heads running around the border; counter makes every other head run backwards. */
 heads?:number;counter?:boolean;
 inward?:boolean;
 /** Also play the marker's particle capture (fire markers burn on top of the land colour). */
 particles?:boolean;
 ring:number;
}
const INK=0x1f1b2d,TAU=Math.PI*2;
const RAINBOW=[0xff5a5a,0xff9f1c,0xffd23f,0x46c46a,0x4ea8ff,0x9b6bff];
export function mix(a:number,b:number,t:number):number{
 const ch=(s:number)=>Math.round(((a>>>s)&255)*(1-t)+((b>>>s)&255)*t);return (ch(16)<<16)|(ch(8)<<8)|ch(0);
}
const hue=(t:number)=>{const f=((t%1)+1)%1*RAINBOW.length,i=Math.floor(f);return mix(RAINBOW[i],RAINBOW[(i+1)%RAINBOW.length],f-i);};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
/** The standard hold: full colour for the first half, then fade out over the owner colour. */
const hold=(t:number)=>t<.5?1:1-(t-.5)/.5;
const flash=(color:(s:TileSpot)=>number)=>(s:TileSpot,t:number):TileLook=>({color:color(s),alpha:hold(t)});
const glow=(line:number,core:number)=>()=>({line,core});
/** Two quick beats inside the hold, like a heartbeat. */
const beats=(t:number)=>Math.max(Math.sin(clamp(t/.22)*Math.PI),.85*Math.sin(clamp((t-.3)/.22)*Math.PI),0);
const stripe=(x:number,y:number,width:number,count:number)=>Math.floor(((x+y*.6)/width%count+count)%count);
/** World distance from the capture origin, and alternating angular sectors around it. */
const far=(s:TileSpot)=>Math.hypot(s.dx,s.dy);
const sector=(s:TileSpot,count:number)=>Math.floor(((Math.atan2(s.dy,s.dx)/TAU+1)%1)*count)%2===1;
export const CAPTURE_THEMES:Readonly<Record<string,CaptureTheme>>={
 // Captures in play are long strips and loops and the wave is short, so each theme is told
 // apart by a pattern fixed on the land (rays, rings, stripes, spirals), not by the wave shape.
 // Special: one pattern in one colour family.
 sun:{tile:flash(s=>sector(s,14)?0xfff6c0:0xffc93c),edge:glow(0xff9f1c,0xfff6c0),ring:0xffc93c},
 orbit:{tile:flash(s=>Math.floor(far(s)/60)%2?0xfff6e0:0xffc93c),edge:glow(0xffb000,0xfff6e0),heads:2,counter:true,ring:0xffc93c},
 crown:{tile:(s,t)=>({color:s.seed<.3&&t>.15&&t<.4?0xffffff:0xffd23f,alpha:hold(t)}),edge:glow(0xffb000,0xfff6c0),ring:0xffd23f},
 meteor:{order:s=>clamp(.5+(s.dx+s.dy)/(2.4*s.radius)),tile:flash(s=>[0xffffff,0xbfe6ff,0x6cc4ff][stripe(s.x,s.y,40,3)]),edge:glow(0x6cc4ff,0xffffff),ring:0x9fd8ff},
 portal:{tile:flash(s=>Math.floor(((Math.atan2(s.dy,s.dx)/TAU*3+far(s)/90)%2+2)%2)?0xd8c8ff:0x7c5cff),edge:glow(0x7c5cff,0xe8e0ff),ring:0x9b6bff},
 heart:{tile:(_s,t)=>({color:0xff6b9a,alpha:beats(t)}),edge:glow(0xff6b9a,0xffe0ea),ring:0xff6b9a},
 storm:{order:s=>clamp(s.dist*.75+s.seed*.25),tile:(s,t)=>({color:s.seed>.82?0xffe066:s.seed>.6&&t<.12?0xffffff:0x8fe3ff,alpha:hold(t)}),edge:glow(0xffd23f,0xffffff),ring:0x8fe3ff},
 // Fire: the land catches (yellow to orange to red) under the flames.
 ember:{tile:(s,t)=>({color:mix(0xffe066,0xff7a1a,clamp(t*1.6+s.seed*.2)),alpha:hold(t)}),edge:glow(0xff7a1a,0xffe066),particles:true,ring:0xff9f1c},
 phoenix:{tile:(s,t)=>({color:mix(0xffe066,0xe8453c,clamp(t*1.5+s.seed*.25)),alpha:hold(t)}),edge:a=>({line:mix(0xe8453c,0xff9f1c,(Math.sin(a*3)+1)/2),core:0xfff1a8}),heads:2,particles:true,ring:0xff7a1a},
 golddragon:{tile:(s,t)=>({color:t<.15&&s.seed>.5?0xffffff:s.seed<.5?0xffd23f:0xffb000,alpha:hold(t)}),edge:glow(0xffb000,0xfffbe0),heads:2,particles:true,ring:0xffd23f},
 // Legendary: richer patterns and wave shapes.
 rainbow:{tile:flash(s=>RAINBOW[stripe(s.x,s.y,70,RAINBOW.length)]),edge:a=>({line:hue(a/TAU),core:0xffffff}),ring:0xffffff},
 blackhole:{tile:flash(s=>mix(0x2a1650,0x9b6bff,s.dist)),edge:glow(0x6b3fd1,0xd8c8ff),inward:true,ring:0x9b6bff},
 snowflake:{tile:(s,t)=>({color:mix(0xffffff,0xa8dcff,clamp(t*1.6+s.seed*.2)),alpha:t<.6?1:1-(t-.6)/.4}),edge:glow(0x8fd0ff,0xffffff),ring:0xd8f0ff},
 sakura:{order:s=>clamp(s.dist*.8+s.seed*.2),tile:flash(s=>[0xffc2d9,0xff8fb8,0xfff0f5][Math.floor(s.seed*3)]),edge:glow(0xff8fb8,0xfff0f5),ring:0xff8fb8},
 kingslime:{tile:(s,t)=>({color:s.seed<.5?0x7ee081:0x46c46a,alpha:hold(t),pop:.38}),edge:glow(0x46c46a,0xd8ffd0),ring:0x7ee081},
 diamond:{tile:(s,t)=>({color:s.seed>.6&&t<.3?0xffffff:0xbff3ff,alpha:hold(t)}),edge:glow(0x6cd4ff,0xffffff),heads:3,ring:0xbff3ff},
 // Completion rewards: one category signature each.
 goldpuck:{tile:flash(s=>Math.round(s.x/55+s.y/48)%2?0xffe066:0xffb000),edge:glow(0xffb000,0xfff6c0),heads:2,ring:0xffd23f},
 crowncat:{tile:flash(s=>[0xff9cc0,0xffd23f][stripe(s.x,s.y,60,2)]),edge:glow(0xffb000,0xffe0ea),ring:0xff9cc0},
 archmage:{order:s=>s.seed,tile:(s,t)=>s.seed<.45?{color:s.seed<.12?0xffffff:0xb48cff,alpha:hold(t)}:null,edge:glow(0x9b6bff,0xe8e0ff),heads:2,ring:0xb48cff},
 goldbot:{order:s=>clamp(.5+s.dy/(2*s.radius)),tile:(s,t)=>({color:t<.15?0xffffff:Math.round(s.x/55+s.y/48)%2?0xffd23f:0xffb000,alpha:hold(t)}),edge:glow(0x6cd4ff,0xffffff),ring:0x8fe3ff},
 starwhale:{order:s=>clamp(s.dist+.12*Math.sin(Math.atan2(s.dy,s.dx)*3)),tile:flash(s=>Math.floor(far(s)/45+Math.sin(Math.atan2(s.dy,s.dx)*3))%2?0xbfe6ff:0x4ea8ff),edge:glow(0x4ea8ff,0xd8f0ff),ring:0x9fd8ff},
 hexcrown:{tile:flash(s=>Math.floor(far(s)/70)%2?0xfff2a8:0xffd23f),edge:glow(0xffb000,0xfff6c0),heads:2,ring:0xffd23f},
};
/** Tiles show the theme this long after flipping. */
export const THEME_HOLD=480;
/** Border light: heads make one turn over SWEEP ms, fading out by THEME_END. */
export const THEME_SWEEP=700,THEME_END=950;
const luminance=(c:number)=>.3*((c>>>16)&255)+.59*((c>>>8)&255)+.11*(c&255);
const distance=(a:number,b:number)=>Math.hypot(((a>>>16)&255)-((b>>>16)&255),((a>>>8)&255)-((b>>>8)&255),(a&255)-(b&255));
/** Keeps a theme colour readable on the owner's land: too close, it goes much lighter or darker. */
export function contrast(color:number,owner:number):number{
 if(distance(color,owner)>=110)return color;
 return luminance(owner)>200?mix(color,INK,.6):mix(color,0xffffff,.7);
}
const hash=(x:number,y:number)=>{const h=Math.sin(x*12.9898+y*78.233)*43758.5453;return h-Math.floor(h);};
/** Builds the spot for a tile from its centre, the capture origin and its plain wave distance. */
export function tileSpot(x:number,y:number,origin:{x:number;y:number},dist:number,radius:number):TileSpot{
 return {dist,dx:x-origin.x,dy:y-origin.y,x,y,radius:Math.max(1,radius),seed:hash(Math.round(x),Math.round(y))};
}
/** Wave length for a capture of this radius: big captures get a slower, readable wave. */
export const themedWave=(radius:number)=>Math.max(250,Math.min(500,radius*.9));
/** Wave delay in ms for this tile, over a wave of waveMs. */
export function themedDelay(theme:CaptureTheme,s:TileSpot,waveMs:number):number{
 const order=theme.order?theme.order(s):s.dist;return (theme.inward?1-order:order)*waveMs;
}
/** Tile overlay `local` ms after it flipped, contrast-guarded against the owner colour. */
export function themedTile(theme:CaptureTheme,s:TileSpot,local:number,owner:number):TileLook|null{
 if(local<0||local>=THEME_HOLD)return null;const look=theme.tile(s,local/THEME_HOLD);
 return look&&look.alpha>0?{...look,color:contrast(look.color,owner)}:null;
}
/** Edge brightness 0..1: a soft glow everywhere plus bright heads travelling around the origin. */
export function themedEdge(theme:CaptureTheme,angle:number,elapsed:number):number{
 if(elapsed<0||elapsed>=THEME_END)return 0;
 const heads=theme.heads??1,turn=elapsed/THEME_SWEEP*TAU;let best=0;
 for(let i=0;i<heads;i++){const head=(theme.counter&&i%2?-turn:turn)-Math.PI/2+i*TAU/heads,gap=Math.abs(((angle-head)%TAU+TAU*1.5)%TAU-Math.PI);best=Math.max(best,Math.max(0,1-gap/1.1)**2);}
 const fade=elapsed<THEME_SWEEP?1:1-(elapsed-THEME_SWEEP)/(THEME_END-THEME_SWEEP);
 return fade*(.35+.65*best);
}
/** Border colours, contrast-guarded against the owner colour. */
export function themedEdgeColors(theme:CaptureTheme,angle:number,owner:number):{line:number;core:number}{
 const c=theme.edge(angle);return {line:contrast(c.line,owner),core:c.core};
}
/** Marker ring radius and alpha, opening out (or closing in) over RING ms. */
export const RING=420;
export function themedRing(theme:CaptureTheme,elapsed:number):{radius:number;alpha:number}|null{
 if(elapsed<0||elapsed>=RING)return null;const t=elapsed/RING;
 return {radius:theme.inward?96-70*t:26+70*t,alpha:1-t};
}

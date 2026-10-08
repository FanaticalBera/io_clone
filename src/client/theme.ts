// Shared look for the field. Territory is a raised tile, a trail is a flat
// translucent tile of the same hue, so a trail never reads heavier than land.
export const INK=0x1f1b2d;
export const FIELD={
 table:0x2b3170,ground:0xeef1f6,groundLine:0xdde3ec,
 rim:0xd4daee,edgeLine:0xb4bbd3,boardEdge:0xa8754b,boardSide:0x6b4329,
 nearEdge:INK,nearDeath:0xff7a1a,
 territoryEdge:.2,lipShade:.38,lipDepth:.3,
 trailAlpha:.38,trailLineAlpha:.55,
 boardThickness:.5,
} as const;
export function mixColor(a:number,b:number,amount:number):number {
 const ch=(shift:number)=>Math.round((a>>shift&255)*(1-amount)+(b>>shift&255)*amount);
 return ch(16)<<16|ch(8)<<8|ch(0);
}
export const cssHex=(color:number)=>'#'+color.toString(16).padStart(6,'0');

import {MARKER_COLORS,markerColorDefinition} from './catalog.js';
import type {MatchView} from '../shared/model.js';
// Stable legacy defaults. These are presentation colors, never owner IDs.
export const SLOT_COLORS:readonly number[]=Object.freeze([0x16cdb1,0xffb43b,0xa180f4,0x359aff,0xff7084,0xb5ce50,0xf3945c,0x59bfd8,0xdc57bd,0x8575d6,0x269779,0xbd8432,0xd65649,0x557ab5,0x859535,0x9b644d]);
export function participantRenderColors(view:Pick<MatchView,'participants'|'config'>,selfId:string|null,colorId:string,online=false):number[]{
 const colors=[...SLOT_COLORS],self=view.participants.find(p=>p.participantId===selfId),selected=markerColorDefinition(colorId)?.value;
 if(!self||selected==null)return colors.map(styledColor);
 const used=new Set<number>([selected]);colors[self.slot]=selected;
 const available=MARKER_COLORS.flatMap(c=>c.value===null?[]:[c.value]);
 const pool=[...new Set([...available,...SLOT_COLORS])];
 const others=view.participants.filter(p=>p.participantId!==selfId).sort((a,b)=>Number(a.kind==='BOT')-Number(b.kind==='BOT')||a.slot-b.slot);
 const pending:typeof others=[];
 // Reserve every unaffected legacy identity first; a collision must not cause a cascade.
 for(const p of others){
  const preferred=online||p.kind==='HUMAN'?SLOT_COLORS[p.slot]:undefined;
  if(preferred!==undefined&&!used.has(preferred)){colors[p.slot]=preferred;used.add(preferred);}else pending.push(p);
 }
 for(const p of pending){const color=pool.find(c=>!used.has(c));if(color===undefined)throw new Error('Participant render palette exhausted');colors[p.slot]=color;used.add(color);}
 return colors.map(styledColor);
}
// Vivid style swaps each pastel identity for a saturated one. The map is
// one-to-one over every slot and shop color, so distinct players stay distinct.
const VIVID=new Map<number,number>([
 [0x16cdb1,0x00c49a],[0xffb43b,0xffbf00],[0xa180f4,0x7a3cf0],[0x359aff,0x0a84ff],[0xff7084,0xff2d55],[0xb5ce50,0x7cc800],[0xf3945c,0xff6a00],[0x59bfd8,0x00b2e3],
 [0xdc57bd,0xe5168a],[0x8575d6,0x4b4bd6],[0x269779,0x00897b],[0xbd8432,0xc27c0e],[0xd65649,0xe02424],[0x557ab5,0x1f4fd1],[0x859535,0x8a9a00],[0x9b644d,0xb0401a],
 [0xc83f4b,0xc8102e],[0xe87325,0xe85d04],[0x36843f,0x1b8a2e],[0x147f84,0x00727a],[0x254bc8,0x1238c4],[0x763782,0x7a1f8f],[0x52687c,0x3f5a78],
]);
let colorStyle:'pastel'|'vivid'='pastel';
export function setColorStyle(style:'pastel'|'vivid'):void{colorStyle=style;}
export function styledColor(color:number):number{return colorStyle==='vivid'?VIVID.get(color)??color:color;}

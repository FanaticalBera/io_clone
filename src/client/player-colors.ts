import {MARKER_COLORS,markerColorDefinition} from './catalog.js';
import type {MatchView} from '../shared/model.js';
// Stable legacy defaults. These are presentation colors, never owner IDs.
export const SLOT_COLORS:readonly number[]=Object.freeze([0x16cdb1,0xffb43b,0xa180f4,0x359aff,0xff7084,0xb5ce50,0xf3945c,0x59bfd8,0xdc57bd,0x8575d6,0x269779,0xbd8432,0xd65649,0x557ab5,0x859535,0x9b644d]);
export function participantRenderColors(view:Pick<MatchView,'participants'|'config'>,selfId:string|null,colorId:string,online=false):number[]{
 const colors=[...SLOT_COLORS],self=view.participants.find(p=>p.participantId===selfId),selected=markerColorDefinition(colorId)?.value;
 if(!self||selected==null)return colors;
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
 return colors;
}

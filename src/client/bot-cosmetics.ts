import {MARKERS} from './catalog.js';
// Independent cosmetic RNG: never consumes MatchState, AI seed or global Math.random.
export function shuffledBotMarkers(matchId:string):readonly string[]{
 const ids=MARKERS.map(m=>m.id);let state=2166136261;
 for(const ch of 'marker-v2:'+matchId)state=Math.imul(state^ch.charCodeAt(0),16777619)>>>0;
 state||=1;
 for(let i=ids.length-1;i>0;i--){state^=state<<13;state^=state>>>17;state^=state<<5;const j=(state>>>0)%(i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}
 return ids;
}

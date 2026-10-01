import type {GameEvent,MatchView} from '../shared/model.js';

/** Playback cursor for confirmed deaths. Initial/recovered state is a baseline, not a hit. */
export class CombatEvents {
 private matchId='';private tick=-1;private seen=new Set<string>();
 accept(view:MatchView,reset=false):GameEvent[]{
  if(reset||view.matchId!==this.matchId){
   this.matchId=view.matchId;this.tick=view.tick;this.seen=new Set(view.events.map(e=>e.eventId));return [];
  }
  if(view.tick<this.tick)return [];
  this.tick=view.tick;const events:GameEvent[]=[];
  for(const event of view.events){
   if(this.seen.has(event.eventId))continue;this.seen.add(event.eventId);
   if(event.type==='DEATH'&&event.tick>=view.tick-view.config.simulationHz&&event.tick<=view.tick)events.push(event);
  }
  if(this.seen.size>2048)this.seen=new Set([...this.seen].slice(-1024));return events;
 }
}

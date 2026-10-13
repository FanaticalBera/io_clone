import {BOT_PHASE02 as C} from './bot-phase02-config.js';
export interface BotAttackPolicy {
 evaluate(targetId:string,targetLife:number,score:number,survival:boolean):{score:number;otherReservations:number;factor:number;reason?:string};
}
// Only a faster cut against the actual threat may bypass planned pursuit limits.
export function survivalCounterAllowed(ownTrail:number,threat:number,home:number|null,cut:number){
 return ownTrail>0&&Number.isFinite(threat)&&Number.isFinite(cut)&&home!==null&&Number.isFinite(home)&&threat<=C.threatEta&&threat+C.etaMargin<home&&cut<=C.counterEta&&cut+C.etaMargin<threat;
}

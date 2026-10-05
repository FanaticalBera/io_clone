import type {MatchState,Participant} from './model.js';
import {trySpawn} from './spawn.js';
export function retryHumanRun(match:MatchState,p:Participant):boolean {
 if(match.phase!=='RUNNING'||p.kind!=='HUMAN'||p.lifeState!=='ELIMINATED'||!p.run?.result)return false;
 p.lifeState='DEAD_WAIT';p.respawnAtTick=match.tick;trySpawn(match,p);return true;
}

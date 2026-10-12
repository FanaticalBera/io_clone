import {validDirection} from './protocol.js';
import type {RoomManager,RoomSession} from './rooms.js';
// Authoritative acceptance of a direction input, shared by the online server and the LAN host (PRD 9.1).
// Callers check their own connection identity and rate limits first.
export function acceptDirection<S extends RoomSession>(rooms:RoomManager<S>,session:S,raw:unknown):void {
 if(session.background||!session.connected||!validDirection(raw))return;
 const current=rooms.member(session);if(!current||current.room.phase!=='RUNNING'||current.member.waitingForNextRound||!current.room.match)return;
 const match=current.room.match,p=match.participants.find(p=>p.participantId===current.member.memberId);
 if(!p||p.kind!=='HUMAN'||p.lifeState!=='ALIVE'||raw.matchId!==match.matchId||raw.lifeId!==p.lifeId)return;
 if(session.inputMatchId!==match.matchId||session.inputLifeId!==p.lifeId){session.highestReceivedSeq=0;session.inputMatchId=match.matchId;session.inputLifeId=p.lifeId;}
 if(raw.seq<=session.highestReceivedSeq)return;
 session.highestReceivedSeq=raw.seq;current.room.inputs.set(p.participantId,{...raw});
}

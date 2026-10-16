// Collection titles a player may show in a room. Anything else from a client is dropped.
export const KNOWN_TITLES:readonly string[]=Object.freeze(['체스 마스터','행운아','농장 주인','바다 탐험가','할로윈 대장','마법 학도','우주 비행사','사계절 여행자']);
export function normalizeTitle(value:unknown):string|undefined{return typeof value==='string'&&KNOWN_TITLES.includes(value)?value:undefined;}
/** A marker or marker-colour id a member shows in a room list; clients draw unknown ids as the default. */
export function normalizeLookId(value:unknown):string|undefined{return typeof value==='string'&&/^[a-z0-9-]{1,24}$/.test(value)?value:undefined;}
/** The equipped marker and colour sent when entering a room (cosmetic, shown in the member list). */
export interface MemberLook {marker?:unknown;color?:unknown}

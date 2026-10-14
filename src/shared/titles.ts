// Collection titles a player may show in a room. Anything else from a client is dropped.
export const KNOWN_TITLES:readonly string[]=Object.freeze(['체스 마스터','행운아','농장 주인','바다 탐험가','할로윈 대장','마법 학도','우주 비행사','사계절 여행자']);
export function normalizeTitle(value:unknown):string|undefined{return typeof value==='string'&&KNOWN_TITLES.includes(value)?value:undefined;}

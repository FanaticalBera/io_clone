import type {DeathContext} from '../shared/model.js';
export function deathMessage(reason:string|null|undefined,context?:DeathContext):string {
 if(reason==='WALL_HIT')return '벽에 부딪쳤어요';
 if(reason!=='TRAIL_CUT')return '영토를 모두 잃었어요';
 if(context?.cause==='HOME_CAPTURE')return '선의 출발 영토를 잃었어요';
 if(context?.cause==='TRAIL_CAPTURE')return '점령으로 선이 끊겼어요';
 if(context?.cause==='TRAIL_CONTACT')return '상대가 선을 밟았어요';
 return '선이 끊겼어요';
}

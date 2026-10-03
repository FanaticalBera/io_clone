import type {GameConfig} from './config.js';
export const EXPERIMENT_MAP_RADII=[22,28,32,36,40] as const;
// Caller must explicitly enable a development/test environment. No persisted
// preference or protocol option is introduced, and production ignores it.
export function experimentalMapConfig(value:string|null|undefined,enabled:boolean):Partial<GameConfig>{
 if(!enabled||value==null)return {};
 if(!EXPERIMENT_MAP_RADII.some(radius=>String(radius)===value))throw new Error('실험 맵 반경은 22 / 28 / 32 / 36 / 40만 사용할 수 있어요.');
 return {mapRadius:Number(value)};
}
export function experimentalSeed(value:string|null|undefined,enabled:boolean):number|undefined{
 if(!enabled||value==null)return undefined;
 if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>0xffffffff)throw new Error('실험 시드는 0부터 4294967295 사이 정수여야 해요.');
 return Number(value);
}

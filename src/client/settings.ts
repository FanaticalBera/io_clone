export type MobileControls='joystick'|'drag';
export interface Settings {mobileControls:MobileControls;killVibration:boolean}
export const SETTINGS_KEY='hexhold.settings';
const defaults:Settings={mobileControls:'joystick',killVibration:true};
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;
export class SettingsStore {
 private value:Settings={...defaults};private listeners=new Set<(settings:Settings)=>void>();
 constructor(private storage:StorageAccess|null=browserStorage()){
  try{const saved=JSON.parse(storage?.getItem(SETTINGS_KEY)??'null');if(saved&&typeof saved==='object')this.value={mobileControls:saved.mobileControls==='drag'?'drag':'joystick',killVibration:typeof saved.killVibration==='boolean'?saved.killVibration:defaults.killVibration};}catch{}
 }
 get():Settings{return {...this.value};}
 update(patch:Partial<Settings>):void{
  this.value={...this.value,...patch};try{this.storage?.setItem(SETTINGS_KEY,JSON.stringify(this.value));}catch{}
  for(const listener of this.listeners)listener(this.get());
 }
 subscribe(listener:(settings:Settings)=>void):()=>void{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
}
function browserStorage():StorageAccess|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}

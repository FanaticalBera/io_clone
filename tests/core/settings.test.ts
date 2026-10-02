import {describe,it,expect,vi} from 'vitest';
import {SettingsStore,SETTINGS_KEY} from '../../src/client/settings.js';
import {KillHaptics,type HapticDevice} from '../../src/client/haptics.js';
describe('local settings',()=>{
 it('persists controls and vibration, isolates returned values and notifies changes',()=>{
  const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}},store=new SettingsStore(storage),listener=vi.fn(),off=store.subscribe(listener);
  expect(store.get()).toEqual({mobileControls:'joystick',killVibration:true});store.update({mobileControls:'drag',killVibration:false});
  expect(new SettingsStore(storage).get()).toEqual({mobileControls:'drag',killVibration:false});expect(listener).toHaveBeenCalledOnce();off();store.update({killVibration:true});expect(listener).toHaveBeenCalledOnce();const copy=store.get();copy.mobileControls='joystick';expect(store.get().mobileControls).toBe('drag');
 });
 it('falls back safely for malformed data and denied storage',()=>{
  for(const data of ['{','null','{"mobileControls":"invalid","killVibration":"yes"}'])expect(new SettingsStore({getItem:()=>data,setItem(){}}).get()).toEqual({mobileControls:'joystick',killVibration:true});
  const store=new SettingsStore({getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}});store.update({mobileControls:'drag'});expect(store.get().mobileControls).toBe('drag');expect(SETTINGS_KEY).toBe('hexhold.settings');
 });
});
describe('kill vibration',()=>{
 it('plays a short pulse only when enabled, supported, visible and activated',()=>{
  let enabled=true,supported=true,visible=true,activated=true;const vibrate=vi.fn(()=>true),device:HapticDevice={supported:()=>supported,visible:()=>visible,activated:()=>activated,vibrate},haptics=new KillHaptics(()=>enabled,device);
  expect(haptics.kill()).toBe(true);expect(vibrate).toHaveBeenLastCalledWith([35,20,55]);
  enabled=false;expect(haptics.kill()).toBe(false);enabled=true;supported=false;expect(haptics.kill()).toBe(false);supported=true;visible=false;expect(haptics.kill()).toBe(false);visible=true;activated=false;expect(haptics.kill()).toBe(false);expect(vibrate).toHaveBeenCalledOnce();
  haptics.stop();expect(vibrate).toHaveBeenLastCalledWith(0);
 });
 it('uses a distinct death pulse and respects the same saved preference',()=>{
  let enabled=true;const vibrate=vi.fn(()=>true),device:HapticDevice={supported:()=>true,visible:()=>true,activated:()=>true,vibrate},haptics=new KillHaptics(()=>enabled,device);
  expect(haptics.death()).toBe(true);expect(vibrate).toHaveBeenLastCalledWith([90,40,120]);enabled=false;expect(haptics.death()).toBe(false);expect(vibrate).toHaveBeenCalledOnce();
 });
 it('tolerates browsers refusing or throwing on vibration',()=>{
  const device:HapticDevice={supported:()=>true,visible:()=>true,activated:()=>true,vibrate:()=>false},haptics=new KillHaptics(()=>true,device);expect(haptics.kill()).toBe(false);
  device.vibrate=()=>{throw new Error('unavailable');};expect(haptics.kill()).toBe(false);expect(()=>haptics.stop()).not.toThrow();device.supported=()=>false;expect(()=>haptics.stop()).not.toThrow();
 });
});


it('persists experimental trackpad controls',()=>{
 const data=new Map<string,string>();
 const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
 const first=new SettingsStore(storage);first.update({mobileControls:'trackpad'});
 expect(first.get().mobileControls).toBe('trackpad');
 const second=new SettingsStore(storage);expect(second.get().mobileControls).toBe('trackpad');
});

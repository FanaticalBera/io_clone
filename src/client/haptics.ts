export interface HapticDevice {supported:()=>boolean;visible:()=>boolean;activated:()=>boolean;vibrate:(pattern:number|number[])=>boolean}
export function browserHaptics():HapticDevice{return {
 supported:()=>typeof navigator.vibrate==='function'&&(navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches),
 visible:()=>!document.hidden,activated:()=>!navigator.userActivation||navigator.userActivation.hasBeenActive,
 vibrate:pattern=>navigator.vibrate(pattern)
};}
export class KillHaptics {
 constructor(private enabled:()=>boolean,private device:HapticDevice=browserHaptics()){}
 supported():boolean{return this.device.supported();}
 kill():boolean{return this.play([35,20,55]);}
 death():boolean{return this.play([90,40,120]);}
 private play(pattern:number[]):boolean{if(!this.enabled()||!this.supported()||!this.device.visible()||!this.device.activated())return false;try{return this.device.vibrate(pattern);}catch{return false;}}
 stop():void{if(this.supported())try{this.device.vibrate(0);}catch{}}
}

import type {Vec} from '../shared/model.js';
import {normalizeDirection} from '../shared/movement.js';
import type {MobileControls} from './settings.js';
import {touchSwipeDirection,touchTrackpadCursor,JOYSTICK_DEAD_ZONE,JOYSTICK_ANGLE_DEAD_ZONE,POINTER_ANGLE_DEAD_ZONE} from './controls.js';
export type DirectionSink=(direction:Vec)=>void;
const KEYS:Record<string,Vec>={w:{x:0,y:-1},arrowup:{x:0,y:-1},s:{x:0,y:1},arrowdown:{x:0,y:1},a:{x:-1,y:0},arrowleft:{x:-1,y:0},d:{x:1,y:0},arrowright:{x:1,y:0}};
export class InputAdapter {
 // Devices publish desired headings; shared simulation owns the actual turn.
 targetDirection:Vec={x:1,y:0};private active=true;private mobileControls:MobileControls='joystick';
 get direction():Vec{return this.targetDirection;}
 get enabled():boolean{return this.active;}
 set enabled(value:boolean){if(!value)this.reset();this.active=value;}
 setMobileControls(mode:MobileControls):void{if(this.mobileControls!==mode){this.reset();this.mobileControls=mode;}}
 private drag:{id:number;anchor:Vec}|null=null;
 private trackpad:{id:number;last:Vec;cursor:Vec|null}|null=null;
 private keys=new Set<string>();private abort=new AbortController();private frame=0;
 private lastSent=-Infinity;private changed=true;
 constructor(private element:HTMLElement,private pointerToDirection:(x:number,y:number)=>Vec|null,private sink:DirectionSink){
  const options={signal:this.abort.signal};
  window.addEventListener('keydown',event=>{
   if(this.isText(event.target)||!this.enabled)return;const key=event.key.toLowerCase();if(!KEYS[key])return;
   event.preventDefault();this.keys.add(key);this.keyboard();
  },options);
  window.addEventListener('keyup',event=>{
   const key=event.key.toLowerCase();if(!KEYS[key])return;this.keys.delete(key);
   if(!this.isText(event.target)&&this.enabled)this.keyboard();
  },options);
  window.addEventListener('blur',()=>this.reset(),options);
  window.addEventListener('resize',()=>this.reset(),options);
  element.addEventListener('pointerdown',event=>{
   if(!this.enabled||event.pointerType!=='touch'||!event.isPrimary||this.drag||this.trackpad)return;
   if(this.mobileControls==='drag'){
    event.preventDefault();this.drag={id:event.pointerId,anchor:{x:event.clientX,y:event.clientY}};element.setPointerCapture(event.pointerId);
   }else if(this.mobileControls==='trackpad'){
    event.preventDefault();this.trackpad={id:event.pointerId,last:{x:event.clientX,y:event.clientY},cursor:null};element.setPointerCapture(event.pointerId);
   }
  },options);
  element.addEventListener('pointermove',event=>{
   if(!this.enabled||event.pointerType!=='touch')return;
   if(this.drag?.id===event.pointerId){
    event.preventDefault();if(this.keys.size)return;
    const point={x:event.clientX,y:event.clientY},direction=touchSwipeDirection(this.drag.anchor,point);
    if(direction){this.drag.anchor=point;this.setDirection(direction);}return;
   }
   if(this.trackpad?.id===event.pointerId){
    event.preventDefault();if(this.keys.size)return;
    const point={x:event.clientX,y:event.clientY},dx=point.x-this.trackpad.last.x,dy=point.y-this.trackpad.last.y;
    this.trackpad.last=point;
    const cursor=touchTrackpadCursor(this.direction,this.trackpad.cursor,dx,dy);
    if(!cursor)return;
    this.trackpad.cursor=cursor;
    this.setPointerDirection(cursor);
   }
  },options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,event=>{
   const id=(event as PointerEvent).pointerId;
   if(this.drag?.id===id)this.releaseDrag();
   if(this.trackpad?.id===id)this.releaseTrackpad();
  },options);
  element.addEventListener('pointermove',event=>{
   if(!this.enabled||event.pointerType==='touch'||this.drag||this.trackpad||this.touchPointer!==null||this.keys.size)return;
   this.pointAt(event.clientX,event.clientY);
  },options);
  const loop=(now:number)=>{this.flush(now);this.frame=requestAnimationFrame(loop);};
  this.frame=requestAnimationFrame(loop);
 }
 private flush(now:number):void {
  if(!this.enabled)return;
  if(now-this.lastSent>=(this.changed?1000/30:100)){this.sink({...this.direction});this.lastSent=now;this.changed=false;}
 }
 private isText(target:EventTarget|null):boolean {
  return target instanceof HTMLElement&&(target.matches('input,textarea,select')||target.isContentEditable);
 }
 private keyboard():void {
  const vector={x:0,y:0};for(const key of this.keys){vector.x+=KEYS[key].x;vector.y+=KEYS[key].y;}this.setDirection(vector);
 }
 setDirection(vector:Vec):void {
  const normalized=normalizeDirection(vector.x,vector.y);if(!normalized)return;
  if(normalized.x!==this.targetDirection.x||normalized.y!==this.targetDirection.y){this.targetDirection=normalized;this.changed=true;}this.flush(performance.now());
 }
 private setPointerDirection(vector:Vec):void{
  if(this.keys.size)return;const normalized=normalizeDirection(vector.x,vector.y);if(!normalized)return;
  if(normalized.x*this.direction.x+normalized.y*this.direction.y>=Math.cos(POINTER_ANGLE_DEAD_ZONE))return;
  this.setDirection(normalized);
 }
 private pointAt(clientX:number,clientY:number):void{
  if(this.keys.size)return;
  const rect=this.element.getBoundingClientRect(),direction=this.pointerToDirection(clientX-rect.left,clientY-rect.top);
  if(direction)this.setPointerDirection(direction);
 }
 private setJoystickDirection(vector:Vec):void{
  if(this.keys.size)return;const normalized=normalizeDirection(vector.x,vector.y);if(!normalized)return;
  if(normalized.x*this.direction.x+normalized.y*this.direction.y>=Math.cos(JOYSTICK_ANGLE_DEAD_ZONE))return;
  this.setDirection(normalized);
 }
private touchPointer:number|null=null;private joystick:HTMLElement|null=null;
 attachJoystick(element:HTMLElement):void {
  this.joystick=element;const options={signal:this.abort.signal};
  const release=()=>{const pointer=this.touchPointer;this.touchPointer=null;if(pointer!==null&&element.hasPointerCapture(pointer))element.releasePointerCapture(pointer);element.querySelector<HTMLElement>('#joystick-thumb')!.style.transform='translate(0px,0px)';};
  const move=(event:PointerEvent)=>{if(!this.enabled||this.touchPointer!==event.pointerId)return;event.preventDefault();
   const rect=element.getBoundingClientRect(),radius=Math.min(rect.width,rect.height)*0.44;
   const dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2),length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;
   element.querySelector<HTMLElement>('#joystick-thumb')!.style.transform='translate('+dx*scale+'px,'+dy*scale+'px)';
   if(length>=radius*JOYSTICK_DEAD_ZONE)this.setJoystickDirection({x:dx,y:dy});
  };
  element.addEventListener('pointerdown',event=>{if(!this.enabled||this.mobileControls!=='joystick'||this.touchPointer!==null)return;this.touchPointer=event.pointerId;element.setPointerCapture(event.pointerId);move(event);},options);
  element.addEventListener('pointermove',move,options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,event=>{if((event as PointerEvent).pointerId===this.touchPointer)release();},options);
  window.addEventListener('resize',release,options);window.addEventListener('blur',release,options);
 }
 private releaseDrag():void{const pointer=this.drag?.id;this.drag=null;if(pointer!==undefined&&this.element.hasPointerCapture(pointer))this.element.releasePointerCapture(pointer);}
 private releaseTrackpad():void{const pointer=this.trackpad?.id;this.trackpad=null;if(pointer!==undefined&&this.element.hasPointerCapture(pointer))this.element.releasePointerCapture(pointer);}
 reset():void {
  this.releaseDrag();this.releaseTrackpad();
  this.keys.clear();if(this.touchPointer!==null&&this.joystick?.hasPointerCapture(this.touchPointer))this.joystick.releasePointerCapture(this.touchPointer);
  this.touchPointer=null;const thumb=this.joystick?.querySelector<HTMLElement>('#joystick-thumb');if(thumb)thumb.style.transform='translate(0px,0px)';
 }
 dispose():void {this.reset();this.abort.abort();cancelAnimationFrame(this.frame);this.keys.clear();this.enabled=false;}
}



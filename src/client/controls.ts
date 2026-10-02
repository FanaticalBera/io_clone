import type {Vec} from '../shared/model.js';
import {normalizeDirection} from '../shared/movement.js';
// CSS pixel dead zones stay consistent when the world view is zoomed out.
export const MOUSE_DEAD_ZONE=18;
export const JOYSTICK_DEAD_ZONE=.25;
export const POINTER_ANGLE_DEAD_ZONE=2*Math.PI/180;
export const TOUCH_SWIPE_THRESHOLD_PX=28;
export const TOUCH_TRACKPAD_RADIUS_PX=72;
export const TOUCH_TRACKPAD_CENTER_DEAD_ZONE_PX=18;
export const TRACKPAD_ANGLE_DEAD_ZONE=5*Math.PI/180;
export const JOYSTICK_ANGLE_DEAD_ZONE=6*Math.PI/180;
// Touch intent is a displacement, independent of the character/camera and mouse
// filtering. The adapter advances its anchor only when this returns a heading.
export function touchSwipeDirection(anchor:Vec,point:Vec):Vec|null {
 const dx=point.x-anchor.x,dy=point.y-anchor.y;
 if(Math.hypot(dx,dy)<TOUCH_SWIPE_THRESHOLD_PX)return null;
 return normalizeDirection(dx,dy);
}
// Experimental PC-like touchpad control. Touch movement moves a virtual mouse
// offset around the player. The offset is capped so long straight drags do not
// make later turns progressively less sensitive, but it may cross the centre
// so a deliberate reverse drag can still request a U-turn.
export function touchTrackpadCursor(direction:Vec,previous:Vec|null,dx:number,dy:number):Vec|null {
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>1e4||Math.abs(dy)>1e4)return null;
 let cursor=previous;
 if(!cursor){
  const normalized=normalizeDirection(direction.x,direction.y)??{x:1,y:0};
  cursor={x:normalized.x*TOUCH_TRACKPAD_RADIUS_PX,y:normalized.y*TOUCH_TRACKPAD_RADIUS_PX};
 }
 let x=cursor.x+dx,y=cursor.y+dy;
 const length=Math.hypot(x,y);
 if(!Number.isFinite(length))return null;
 if(length>TOUCH_TRACKPAD_RADIUS_PX){
  const scale=TOUCH_TRACKPAD_RADIUS_PX/length;x*=scale;y*=scale;
 }
 return{x,y};
}
export function gameplayZoom(width:number):number{return width<600?.45:.5;}

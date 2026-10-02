import type {Vec} from '../shared/model.js';
import {normalizeDirection} from '../shared/movement.js';
// CSS pixel dead zones stay consistent when the world view is zoomed out.
export const MOUSE_DEAD_ZONE=18;
export const JOYSTICK_DEAD_ZONE=.25;
export const POINTER_ANGLE_DEAD_ZONE=2*Math.PI/180;
export const TOUCH_SWIPE_THRESHOLD_PX=28;
export const JOYSTICK_ANGLE_DEAD_ZONE=6*Math.PI/180;
// Touch intent is a displacement, independent of the character/camera and mouse
// filtering. The adapter advances its anchor only when this returns a heading.
export function touchSwipeDirection(anchor:Vec,point:Vec):Vec|null {
 const dx=point.x-anchor.x,dy=point.y-anchor.y;
 if(Math.hypot(dx,dy)<TOUCH_SWIPE_THRESHOLD_PX)return null;
 return normalizeDirection(dx,dy);
}
export function gameplayZoom(width:number):number{return width<600?.45:.5;}

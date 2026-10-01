// CSS pixel dead zones stay consistent when the world view is zoomed out.
export const MOUSE_DEAD_ZONE=18;
export const JOYSTICK_DEAD_ZONE=.25;
export const POINTER_ANGLE_DEAD_ZONE=2*Math.PI/180;
export function gameplayZoom(width:number):number{return width<600?.45:.5;}

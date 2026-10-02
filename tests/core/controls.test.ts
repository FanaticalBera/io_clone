import {it,expect} from 'vitest';
import {touchSwipeDirection,touchTrackpadCursor,TOUCH_SWIPE_THRESHOLD_PX,TOUCH_TRACKPAD_RADIUS_PX} from '../../src/client/controls.js';

it('uses one CSS-pixel distance threshold and normalizes the accepted swipe',()=>{
 const anchor={x:130,y:240};
 expect(touchSwipeDirection(anchor,{x:130+TOUCH_SWIPE_THRESHOLD_PX-.01,y:240})).toBeNull();
 expect(touchSwipeDirection(anchor,{x:130+TOUCH_SWIPE_THRESHOLD_PX,y:240})).toEqual({x:1,y:0});
 expect(touchSwipeDirection(anchor,{x:160,y:200})).toEqual({x:.6,y:-.8});
});

it('is independent of where on the screen the swipe starts',()=>{
 for(const anchor of [{x:10,y:20},{x:350,y:700},{x:800,y:30}])
  expect(touchSwipeDirection(anchor,{x:anchor.x,y:anchor.y-45})).toEqual({x:0,y:-1});
});

it('accepts a sufficient swipe without a mouse angle filter or turn ramp',()=>{
 const angle=Math.PI/180;
 const heading=touchSwipeDirection({x:0,y:0},{x:45*Math.cos(angle),y:45*Math.sin(angle)})!;
 expect(heading.x).toBeCloseTo(Math.cos(angle),12);expect(heading.y).toBeCloseTo(Math.sin(angle),12);
});

it('rejects invalid coordinates and stationary finger jitter',()=>{
 const anchor={x:300,y:500};
 for(const point of [{x:NaN,y:500},{x:Infinity,y:500},{x:300,y:-Infinity},{x:1e8,y:500},{x:303,y:497}])
  expect(touchSwipeDirection(anchor,point)).toBeNull();
});


it('moves a virtual mouse from the current heading using only touch deltas',()=>{
 const start=touchTrackpadCursor({x:1,y:0},null,0,0)!;
 expect(start).toEqual({x:TOUCH_TRACKPAD_RADIUS_PX,y:0});
 const moved=touchTrackpadCursor({x:1,y:0},start,0,-24)!;
 expect(moved.x).toBeGreaterThan(0);expect(moved.y).toBeLessThan(0);
 expect(Math.hypot(moved.x,moved.y)).toBeLessThanOrEqual(TOUCH_TRACKPAD_RADIUS_PX+1e-9);
});

it('trackpad touch-down location is irrelevant and a new gesture resumes from the last heading',()=>{
 const heading={x:0,y:-1};
 const a=touchTrackpadCursor(heading,null,12,0)!;
 const b=touchTrackpadCursor(heading,null,12,0)!;
 expect(a).toEqual(b);
 expect(a.y).toBeLessThan(0);expect(a.x).toBeGreaterThan(0);
});

it('caps long virtual cursor travel so steering sensitivity does not decay with drag length',()=>{
 let cursor=touchTrackpadCursor({x:1,y:0},null,0,0)!;
 for(let i=0;i<20;i++)cursor=touchTrackpadCursor({x:1,y:0},cursor,20,0)!;
 expect(Math.hypot(cursor.x,cursor.y)).toBeCloseTo(TOUCH_TRACKPAD_RADIUS_PX,10);
 const turned=touchTrackpadCursor({x:1,y:0},cursor,0,-24)!;
 const direction={x:turned.x/Math.hypot(turned.x,turned.y),y:turned.y/Math.hypot(turned.x,turned.y)};
 expect(direction.y).toBeLessThan(-.2);
});

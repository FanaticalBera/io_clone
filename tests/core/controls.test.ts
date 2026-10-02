import {it,expect} from 'vitest';
import {touchSwipeDirection,TOUCH_SWIPE_THRESHOLD_PX} from '../../src/client/controls.js';

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

import {describe,it,expect} from 'vitest';
import type Phaser from 'phaser';
import {installFrameLimit} from '../../src/client/frame-limit.js';
import {seededRandom} from '../../src/shared/random.js';

/** Drives the installed limiter like requestAnimationFrame would and counts game steps per second. */
function stepsPerSecond(hz:number,jitterMs:number,seconds=10){
 const loop={hasFpsLimit:false,fpsLimit:0,_limitRate:0,smoothStep:false,smoothDelta:(d:number)=>d,nextFpsUpdate:Infinity,updateFPS(){},framesThisSecond:0,frame:0,
  now:0,lastTime:0,rawDelta:0,time:0,delta:0,callback:(_t:number,_d:number)=>{},stepLimitFPS:(_t:number)=>{}};
 let steps=0;loop.callback=()=>{steps++;};
 installFrameLimit({loop} as unknown as Phaser.Game,60);
 const random=seededRandom(hz),period=1000/hz;
 for(let i=1;i<=seconds*hz;i++)loop.stepLimitFPS(i*period+(random()-.5)*2*jitterMs);
 return steps/seconds;
}

describe('Performance PRD Q1: 60 fps frame limit',()=>{
 it('holds 60 steps per second on 60, 90, 120 and 144 Hz displays, with vsync jitter',()=>{
  for(const hz of [60,90,120,144])for(const jitter of [0,.3,1]){
   const rate=stepsPerSecond(hz,jitter);
   expect(rate,hz+' Hz, jitter '+jitter+' ms').toBeGreaterThanOrEqual(hz===144?55:58);
   expect(rate,hz+' Hz, jitter '+jitter+' ms').toBeLessThanOrEqual(61);
  }
 });
 it('falls back to every frame on a slower display instead of dropping further',()=>{
  expect(stepsPerSecond(50,.5)).toBeCloseTo(50,0);
  expect(stepsPerSecond(30,.5)).toBeCloseTo(30,0);
 });
 it('can be disabled for measurement comparisons',()=>{
  const loop={hasFpsLimit:true} as unknown as Phaser.Core.TimeStep;
  installFrameLimit({loop} as unknown as Phaser.Game,0);
  expect(loop.hasFpsLimit).toBe(false);
 });
});

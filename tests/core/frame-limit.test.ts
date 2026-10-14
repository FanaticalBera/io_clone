import {describe,it,expect} from 'vitest';
import type Phaser from 'phaser';
import {installFrameLimit} from '../../src/client/frame-limit.js';
import {seededRandom} from '../../src/shared/random.js';

/** Drives the installed limiter like requestAnimationFrame would and counts game steps per second. */
function createLoop(){
 const loop={hasFpsLimit:false,fpsLimit:0,_limitRate:0,smoothStep:false,smoothDelta:(d:number)=>d,nextFpsUpdate:Infinity,updateFPS(){},framesThisSecond:0,frame:0,
  now:0,lastTime:0,rawDelta:0,time:0,delta:0,callback:(_t:number,_d:number)=>{},stepLimitFPS:(_t:number)=>{}};
 return loop;
}
function stepsPerSecond(hz:number,jitterMs:number,seconds=10,fps=60){
 const loop=createLoop();
 let steps=0;loop.callback=()=>{steps++;};
 const setFps=installFrameLimit({loop} as unknown as Phaser.Game,60);setFps(fps);
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
 it('0 means every display frame, and the cap can change at runtime (30 fps idle under overlays)',()=>{
  expect(stepsPerSecond(120,.3,10,0)).toBeCloseTo(120,0);
  expect(stepsPerSecond(120,.3,10,30)).toBeGreaterThanOrEqual(29);
  expect(stepsPerSecond(120,.3,10,30)).toBeLessThanOrEqual(31);
 });
 it('never delivers scheduling remainder twice as game time, including slower displays',()=>{
  for(const hz of [30,50,60,90,120,144]){
   const loop=createLoop();let elapsed=0;loop.callback=(_time,delta)=>{elapsed+=delta;};
   installFrameLimit({loop} as unknown as Phaser.Game,60);
   for(let i=1;i<=hz*10;i++)loop.stepLimitFPS(i*1000/hz);
   expect(elapsed,hz+' Hz game time').toBeGreaterThanOrEqual(10000-1000/60);
   expect(elapsed,hz+' Hz game time').toBeLessThanOrEqual(10000+1e-7);
  }
 });
 it('paces with display timestamps when smoothing retains the previous refresh rate',()=>{
  const loop=createLoop();loop.smoothStep=true;loop.smoothDelta=()=>1000/120;
  let steps=0;loop.callback=()=>{steps++;};const set=installFrameLimit({loop} as unknown as Phaser.Game,60);
  for(let i=1;i<=120;i++)loop.stepLimitFPS(i*1000/120);
  set(30);for(let i=1;i<=120;i++)loop.stepLimitFPS(1000+i*1000/120);
  steps=0;set(60);
  // Adaptive displays may return at 60 Hz while Phaser still averages 120 Hz samples.
  for(let i=1;i<=60;i++)loop.stepLimitFPS(2000+i*1000/60);
  expect(steps).toBe(60);
 });
 it('preserves elapsed time across repeated live/idle changes',()=>{
  const loop=createLoop();let elapsed=0;loop.callback=(_time,delta)=>{elapsed+=delta;};
  const set=installFrameLimit({loop} as unknown as Phaser.Game,60);
  for(let i=1;i<=1200;i++){if(i%137===0)set(30);if(i%137===63)set(60);loop.stepLimitFPS(i*1000/120);}
  expect(elapsed).toBeGreaterThanOrEqual(10000-1000/30);expect(elapsed).toBeLessThanOrEqual(10000+1e-7);
 });
});

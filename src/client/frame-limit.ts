import type Phaser from 'phaser';
/**
 * 60 fps cap that keeps the leftover time (performance PRD Q1). Phaser's own limiter resets the
 * accumulated delta to zero after each frame, so on a 120 Hz screen two vsyncs (16.66 ms) can fall a
 * hair short of 16.67 ms and skip to a third, giving ~40 fps. Carrying the remainder (with a small
 * jitter allowance, repaid as a small debt so the average stays exact) yields 60 fps on 60, 90, 120
 * and 144 Hz displays alike. The returned setter changes the cap at runtime (0 = every display frame).
 */
export function installFrameLimit(game:Phaser.Game,fps:number):(fps:number)=>void {
 const loop=game.loop as unknown as Omit<Phaser.Core.TimeStep,'frame'>&{_limitRate:number;smoothStep:boolean;smoothDelta(d:number):number;nextFpsUpdate:number;updateFPS(t:number):void;framesThisSecond:number;callback:(time:number,delta:number)=>void;stepLimitFPS:(time:number)=>void;frame:number};
 let rate=0,allowance=0;
 const setFps=(next:number)=>{rate=next>0?1000/next:0;allowance=rate*.1;loop.fpsLimit=next>0?next:0;loop._limitRate=rate;};
 // Always use this step (also for "no cap"), so the cap can change while the loop runs.
 loop.hasFpsLimit=true;setFps(fps);
 loop.stepLimitFPS=function(this:typeof loop,time:number){
  this.now=time;let delta=Math.max(0,time-this.lastTime);this.rawDelta=delta;this.time+=delta;
  if(this.smoothStep)delta=this.smoothDelta(delta);
  this.delta+=delta;
  if(time>=this.nextFpsUpdate)this.updateFPS(time);
  this.framesThisSecond++;
  if(this.delta>=rate-allowance){const step=this.delta;this.callback(time,step);this.delta=Math.min(rate,Math.max(-allowance,step-rate));}
  this.lastTime=time;this.frame++;
 };
 return setFps;
}

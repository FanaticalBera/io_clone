import Phaser from 'phaser';
import {setPerfSink} from '../shared/perf-sink.js';
// Measurement only (performance PRD M1), active with ?metrics=1. Nothing here runs otherwise.
// Top-level groups never overlap: step and render are Phaser's own frame phases; sim, recv and net
// run outside them (practice loop, snapshot handling, LAN host). Leaves ('group.leaf') break a group
// down for diagnosis and are never added on top of their group.
export const metricsEnabled=typeof location!=='undefined'&&new URLSearchParams(location.search).get('metrics')==='1';
export const PERF_GROUPS=['step','render','sim','recv','net'] as const;
const FRAME_CAPACITY=1<<17;
interface Row {t:number;renders:number;rafs:number;heapMb:number|null;spans:Record<string,number>;marks:string[]}
const quantile=(sorted:ArrayLike<number>,q:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))]:0;
class PerfMeter {
 readonly startedAt=performance.now();
 private frameAt=new Float64Array(FRAME_CAPACITY);private frameInterval=new Float32Array(FRAME_CAPACITY);
 private frameStep=new Float32Array(FRAME_CAPACITY);private frameRender=new Float32Array(FRAME_CAPACITY);
 private frames=0;private lastRender=0;private stepStart=0;private renderStart=0;private stepMs=0;
 private bucket:Record<string,number>={};private renders=0;private rafs=0;private marks:string[]=[];
 readonly rows:Row[]=[];info:Record<string,unknown>={};
 readonly sink={now:()=>performance.now(),add:(name:string,start:number)=>{this.bucket[name]=(this.bucket[name]??0)+performance.now()-start;}};
 attach(game:Phaser.Game):void {
  game.events.on(Phaser.Core.Events.PRE_STEP,()=>{this.stepStart=performance.now();});
  game.events.on(Phaser.Core.Events.POST_STEP,()=>{this.stepMs=performance.now()-this.stepStart;this.bucket.step=(this.bucket.step??0)+this.stepMs;});
  game.events.on(Phaser.Core.Events.PRE_RENDER,()=>{this.renderStart=performance.now();});
  game.events.on(Phaser.Core.Events.POST_RENDER,()=>{
   const now=performance.now(),render=now-this.renderStart;this.bucket.render=(this.bucket.render??0)+render;this.renders++;
   const i=this.frames%FRAME_CAPACITY;this.frameAt[i]=now;this.frameInterval[i]=this.lastRender?now-this.lastRender:0;this.frameStep[i]=this.stepMs;this.frameRender[i]=render;
   this.frames++;this.lastRender=now;
  });
  document.addEventListener('visibilitychange',()=>{this.lastRender=0;this.mark(document.hidden?'hidden':'visible');});
  // Display refresh reference only; the game's own render count is measured above.
  const raf=()=>{this.rafs++;requestAnimationFrame(raf);};requestAnimationFrame(raf);
  setInterval(()=>this.roll(),1000);
 }
 mark(label:string):void {this.marks.push(label);}
 private roll():void {
  const memory=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory;
  this.rows.push({t:Math.round((performance.now()-this.startedAt)/1000),renders:this.renders,rafs:this.rafs,heapMb:memory?Math.round(memory.usedJSHeapSize/1048576*10)/10:null,spans:this.bucket,marks:this.marks});
  if(this.rows.length>7200)this.rows.shift();
  this.bucket={};this.renders=0;this.rafs=0;this.marks=[];this.overlay();
 }
 /** Frame statistics over the last `seconds` (or everything still buffered). */
 frameStats(seconds=Infinity){
  const now=performance.now(),count=Math.min(this.frames,FRAME_CAPACITY),intervals:number[]=[],cpu:number[]=[],render:number[]=[];
  for(let k=0;k<count;k++){const i=(this.frames-1-k)%FRAME_CAPACITY;if(now-this.frameAt[i]>seconds*1000)break;
   if(this.frameInterval[i]>0)intervals.push(this.frameInterval[i]);cpu.push(this.frameStep[i]+this.frameRender[i]);render.push(this.frameRender[i]);}
  intervals.sort((a,b)=>a-b);cpu.sort((a,b)=>a-b);render.sort((a,b)=>a-b);
  const worst=intervals.slice(Math.floor(intervals.length*.99)),low=worst.length?1000/(worst.reduce((n,v)=>n+v,0)/worst.length):0;
  const r=(v:number)=>Math.round(v*100)/100;
  return {frames:cpu.length,interval:{p50:r(quantile(intervals,.5)),p95:r(quantile(intervals,.95)),max:r(intervals.at(-1)??0)},onePercentLowFps:r(low),
   frameCpu:{p50:r(quantile(cpu,.5)),p95:r(quantile(cpu,.95)),max:r(cpu.at(-1)??0)},renderCpu:{p50:r(quantile(render,.5)),p95:r(quantile(render,.95)),max:r(render.at(-1)??0)}};
 }
 /** Per-second totals summed over the last `seconds` rows: JS ms per second by group and leaf. */
 spanStats(seconds=Infinity){
  const rows=this.rows.slice(-Math.min(this.rows.length,seconds===Infinity?this.rows.length:seconds)),totals:Record<string,number>={};
  let renders=0,rafs=0;for(const row of rows){renders+=row.renders;rafs+=row.rafs;for(const [k,v]of Object.entries(row.spans))totals[k]=(totals[k]??0)+v;}
  const n=Math.max(1,rows.length),perSecond:Record<string,number>={};for(const [k,v]of Object.entries(totals))perSecond[k]=Math.round(v/n*100)/100;
  const jsPerSecond=PERF_GROUPS.reduce((s,g)=>s+(perSecond[g]??0),0);
  return {seconds:rows.length,rendersPerSecond:Math.round(renders/n*10)/10,rafsPerSecond:Math.round(rafs/n*10)/10,jsMsPerSecond:Math.round(jsPerSecond*100)/100,perSecond};
 }
 snapshot(seconds=Infinity){return {info:this.info,frames:this.frameStats(seconds),spans:this.spanStats(seconds)};}
 private output?:HTMLOutputElement;
 private overlay():void {
  if(!this.output){const output=document.createElement('output');output.style.cssText='position:fixed;bottom:8px;left:50%;transform:translateX(-50%);padding:6px 10px;background:#08121fe8;color:#cbe5df;border:1px solid #527b78;border-radius:6px;font:11px monospace;pointer-events:none;z-index:50;white-space:nowrap';
   output.setAttribute('aria-label','최근 30초 프레임 측정');document.body.append(output);this.output=output;}
  const f=this.frameStats(30),s=this.spanStats(30),p=s.perSecond,ms=(v?:number)=>(v??0).toFixed(0);
  this.output.textContent='렌더 '+s.rendersPerSecond+'/s · rAF '+s.rafsPerSecond+'/s · CPU p95 '+f.frameCpu.p95.toFixed(1)+'ms · 1% '+f.onePercentLowFps.toFixed(0)+' · JS '+ms(s.jsMsPerSecond)+'ms/s (sim '+ms(p.sim)+' step '+ms(p.step)+' render '+ms(p.render)+' recv '+ms(p.recv)+' net '+ms(p.net)+')'+(this.output.dataset.rtt?' · RTT '+this.output.dataset.rtt+'ms':'');
  this.output.dataset.fps=String(s.rendersPerSecond);this.output.dataset.lowFps=f.onePercentLowFps.toFixed(2);
 }
}
let meter:PerfMeter|null=null;
export function startFrameMeter(game:Phaser.Game):PerfMeter|null{
 if(!metricsEnabled||meter)return meter;
 meter=new PerfMeter();setPerfSink(meter.sink);meter.attach(game);
 const api={snapshot:(seconds?:number)=>meter!.snapshot(seconds),rows:(from=0)=>meter!.rows.filter(r=>r.t>=from),mark:(label:string)=>meter!.mark(label),info:meter.info};
 Object.assign(window,{__HEXHOLD_PERF__:api});
 return meter;
}
export function perfMark(label:string):void {meter?.mark(label);}
export function perfInfo(values:Record<string,unknown>):void {if(meter)Object.assign(meter.info,values);}

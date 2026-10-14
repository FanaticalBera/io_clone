// Optional timing hook for measurement builds (performance PRD M1). Shared code reports named
// spans; nothing is recorded unless a client measurement session installs a sink.
// Span names: '<group>' or '<group>.<leaf>'. Groups never overlap each other; leaves sit inside their group.
export interface PerfSink {now():number;add(name:string,start:number):void}
const NO_PERF:PerfSink={now:()=>0,add:()=>{}};
let sink:PerfSink=NO_PERF;
export function setPerfSink(next:PerfSink|null):void {sink=next??NO_PERF;}
export function perfNow():number {return sink.now();}
export function perfAdd(name:string,start:number):void {sink.add(name,start);}

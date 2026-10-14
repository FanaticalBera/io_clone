const NO_PERF = { now: () => 0, add: () => { } };
let sink = NO_PERF;
export function setPerfSink(next) { sink = next ?? NO_PERF; }
export function perfNow() { return sink.now(); }
export function perfAdd(name, start) { sink.add(name, start); }

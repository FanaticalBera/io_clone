// Preserve outcomes and event context without whole-map snapshots or frame journals.
export function compactDiagnostic(value: unknown): unknown {
 return JSON.parse(JSON.stringify(value,(key,item)=>
  ['journal','ownersBefore','trailMasksBefore'].includes(key)?undefined:item));
}

type DeathReport = {
 seed:number; mixed:boolean; ticks:number; deaths:number;
 causes:Record<string,number>; failures:string[];
 traces:{victimKind:'HUMAN'|'BOT';reason:string; context?:{cause:string}|null}[];
};

export function summarizeDeaths(reports:DeathReport[]) {
 const causes:Record<string,number>={},representatives=new Map<string,unknown>();
 const byKind={HUMAN:{deaths:0,causes:{} as Record<string,number>},BOT:{deaths:0,causes:{} as Record<string,number>}};
 for(const report of reports){
  for(const [cause,count] of Object.entries(report.causes))causes[cause]=(causes[cause]??0)+count;
  for(const trace of report.traces){
   const cause=trace.context?.cause??trace.reason,kind=byKind[trace.victimKind];kind.deaths++;kind.causes[cause]=(kind.causes[cause]??0)+1;
   if(!representatives.has(cause))representatives.set(cause,compactDiagnostic({seed:report.seed,mixed:report.mixed,...trace}));
  }
 }
 return {
  byKind,games:reports.length,deaths:reports.reduce((sum,r)=>sum+r.deaths,0),causes,
  failureCount:reports.reduce((sum,r)=>sum+r.failures.length,0),
  reports:reports.map(({traces,...report})=>report),
  representativeCases:Object.fromEntries(representatives),
 };
}

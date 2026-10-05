import {it,expect} from 'vitest';
import {runLargeWorld,statistics,inspectInitialPlacement} from '../../scripts/large-world-audit.js';
import {createMatch} from '../baseline.js';
import {botSpecs} from '../../src/shared/bot.js';
it('large-world accounting preserves deterministic normal gameplay and reports unobserved scans as null',()=>{
 const a=runLargeWorld(56,16,4,.1),b=runLargeWorld(56,16,4,.1);expect(a.hash).toBe(b.hash);expect(a.durationSeconds).toBe(6);expect(a.timing.tick!.n).toBe(180);expect(a.snapshot.bytes.n).toBe(6);expect(a.timing.sampledSpawnScan).toBeNull();expect(a.violations).toEqual([]);
 expect(a.initial).toMatchObject({owned:112,neutral:9465,overlaps:0,outOfMap:0,invalidZones:0,controlPointOverlaps:0});expect(a.initial.minDistance).toBeGreaterThan(4);expect(a.snapshot.bytesPerSecondPerClient).toBe(a.snapshot.bytes.mean*10);
});
it('independent initial placement accounting detects corruption and quantiles use actual samples',()=>{
 const m=createMatch({mapRadius:56,maxSlots:16},4,botSpecs(16));m.owners[m.participants[15].cellId]=0;expect(inspectInitialPlacement(m).invalidZones).toBe(1);
 expect(statistics([])).toBeNull();expect(statistics([5,1,3,2,4])).toMatchObject({n:5,mean:3,median:3,p95:5,p99:5,max:5});
});

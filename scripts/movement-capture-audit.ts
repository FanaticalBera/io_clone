import {MovementCaptureFixture} from '../tests/movement-capture-fixture.js';

// Normal spawns, direction inputs and actual movement/capture only. The output
// includes the capture observer's before/after state and the complete route.
const reports = [false, true].map(reverse => {
 const fixture = new MovementCaptureFixture(reverse);
 fixture.run();
 return {
  reverse,
  seed: fixture.match.seed,
  contacts: fixture.directContacts,
  captureTick: fixture.captureTick,
  trace: fixture.traces,
  journal: fixture.journal,
 };
});
console.log(JSON.stringify(reports, null, 2));

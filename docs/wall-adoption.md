# Wall tolerance adoption — 2026-10-07

The user approved the quarter-cell spatial variant. Production, ordinary practice and online now share that rule and the boundary visuals. No opt-in URL is required. Development/test practice retains experimentWall=strict solely for comparison; online and production ignore it.

## Adopted behavior

- Only exterior faces move outward by sqrt(3) × hex side × .25: 13.856406 world units at side 32. This is about 6.9 CSS px at normal gameplay zoom, 6.2 px on small landscape screens. Corners join the offset planes, rather than applying a larger map radius.
- Movement continues at the existing speed/turn rate through the original boundary. Crossing the new brown death line resolves WALL_HIT immediately at its actual subtick. No grace timer, recharge, stop, sliding, reflection or auto steering remains.
- Nearby original boundaries are emphasized; a faint outside ribbon and brown lethal outline make the tolerance visible. Both HUMAN and BOT use the same rule, including slot 15.
- movementCell attaches positions in the permitted strip to existing boundary cells. Interior seams, R56's 9577 cells, owner/trail storage, capture/cut resolution, spawn and Classic victory conditions remain unchanged.
- Shared movement, Presentation prediction, online predicted trail preview and reconnect/reset snapshots use the same geometry. Protocol version increases from 5 to 6 so cached clients with the old strict rule are rejected with the existing refresh message. No snapshot payload or profile schema fields are added.
- Tutorial, README, PRD and TECH_SPEC now describe the new lethal line.

## Regression checks

- Core/server: 77 files, 447 tests passed. Includes exact geometry, R56 union outline, 360 nondegenerate approach angles, slot 15, simultaneous contact ordering, capture/death, default prediction, real Socket.IO reconnect from the permitted strip and rejection of protocol-5 clients.
- Browser: 21 distinct tests passed across input, production LAN-interface serving, online admission/reconnect, ordinary practice, wall comparison/drill, Run/retry and IndexedDB rewards. Initial online/reconnect assertions still described obsolete 8-player/automatic-HUMAN-respawn behavior; the tests now verify the existing 16-player/manual-Classic-Retry behavior. Game rules were not changed to satisfy those tests.
- 844×390, 640×320 and 568×320: ordinary practice without a margin query shows the boundary, survives crossing the original line, dies at the new line, has no document overflow and zero page errors. Comparison/drill checks also exercise the existing touch joystick and bounded Graphics objects. Screens: .local/adopted-wall-{width}.png. These are browser-emulated mobile viewports; the user's prior hands-on approval remains the physical-device assessment.
- Typecheck and production build passed. The existing >500 kB bundle warning remains.
- R56/16 default-rule smoke: seed 4 and 19, 3600 ticks / 120 seconds each; 9577 cells, 16 participants, ownership checks, 106802 live-position checks, zero BOT wall deaths. CPU means were 2.640 / 2.405 ms and p95 13.713 / 13.034 ms in these local runs. This is a stability check, not a performance or balance improvement claim. Raw data: .local/wall-adoption-r56.json.

## BOT trajectories and scope

BOT source, personality, scheduling and RNG are unchanged. Its existing movement forecasts necessarily see the newly permitted space, so trajectories can change. Historical strict defender/spawn hashes remain tested alongside separate pins for padded geometry; instrumentation equivalence and three two-minute BOT expansion seeds still pass. The emergent ESCAPE cut-and-return witness now uses seed 4 at tick 4358, cut tick 4374, retaining all real-movement safety assertions.

The pre-existing exact interior-edge rounding tie is pinned separately. The smoke runs each had one adjacent-cell tie precisely on an original shared face; there were no non-seam mismatches or invalid live positions. This unrelated interior behavior was not redesigned.

Reward eligibility/formula, profile/inventory/IndexedDB, cosmetic rendering, bot territory-awareness experiment and UI layout are unchanged. Generated build/test evidence is backed up locally rather than included as source changes.

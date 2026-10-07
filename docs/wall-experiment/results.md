# Spatial wall tolerance experiment — 2026-10-07

Original experiment: codex/experiment-wall-margin, based on master bca0375. The user approved the quarter-cell variant on 2026-10-07; it is now the shared default. See ../wall-adoption.md for adoption checks. The comparisons and numbers below describe the original experiment.

## Current rule

The previous .2-second grace, budgets, recharge and clamp-while-turning experiment have been removed. No nonlethal wall or sliding mode is retained. Boundary emphasis remains in both comparison variants.

- Adopted default: production, practice and online use the quarter-cell margin and boundary emphasis. Development/test practice can still use ?experimentWall=strict to compare original geometry. Production and online ignore that override.
- Only hex faces without an existing neighbour are offset outward by a quarter of hex centre spacing: sqrt(3) * 32 * .25 = 13.856 world units. Corners use intersections of those offset planes, not an invented larger hex map. Shared cell faces keep their exact original positions.
- Movement does not pause at the old wall. It keeps its speed/heading until it crosses the new lethal outline, where WALL_HIT resolves immediately at the exact subtick. There is no timer, recharge, reflection, auto steering or sliding.
- Outside positions in the narrow permitted strip identify an existing boundary cell. Ownership/trail arrays and R56's 9577-cell count remain unchanged; no extra territory is created. Trail cuts, capture, territory loss and kill credit remain active.
- The faint outside ribbon and brown outline show the permitted margin and final death line. Nearby original boundary segments remain darker. The renderer fills padded boundary polygons underneath the original ground, so interior gameplay information is not covered by the ribbon.
- Geometry is per map in a WeakMap. HUMAN/BOT and slot 15 use the same rule. Prediction uses the same padded geometry; authoritative life/death is unchanged. No inventory/profile/reward schema, network payload, AI code or RNG changes.

## Screens

- /docs/wall-experiment/: identical-input original/spatial comparison; shallow graze, jagged edge, direct outward approach; slow replay.
- /docs/wall-experiment/?play=1&variant=margin: actual Phaser R56/16 fixture, 48 IMAGE marker and existing touch joystick, keyboard and mouse. No reward/profile writes.
- /?experimentWall=margin&experimentSeed=4: complete normal-menu practice. Use strict for the baseline. Old grace URLs no longer enable an experimental rule.

## Checks

New tests cover exact face offset, full-speed crossing, immediate new-line death, shallow escape, repeated approaches without history, unchanged interior cell crossings, union-outline classification, 360 approach angles, prediction through outside snapshots, protocol/board-array stability, HUMAN/BOT slot 15 and cut/capture/territory-loss resolution. On adoption, wall-impact fixtures were moved to the new lethal line while preserving their impact ordering and expected outcomes.

An exact 210-degree ray on an interior shared edge produces trace cell 28 and rounded world cell 37 in master itself; direct comparison with the untouched master implementation confirmed identical outputs. That legacy tie is pinned separately. Nondegenerate angles retain strict point/cell consistency assertions; the outside-strip and lethal-outline checks are not relaxed.

Browser checks use 844x390, 640x320 and 568x320, including real joystick touch events in browser emulation, no document overflow and bounded Graphics resources. Physical-phone comfort remains for the user's evaluation. Final validation: 76 Core/Server files, 442 tests passed; browser test passed at all three viewports with zero page errors; typecheck and production build passed (existing bundle-size warning only). Those were pre-adoption experiment checks.

## R56/16 smoke simulation

Seed 4, one HUMAN and 15 BOT, 3600 ticks / 120 seconds per variant. Both retained 9577 cells and 16 participants, valid permitted positions/cell IDs, ownership invariants and zero BOT wall deaths. This run had no live head outside the original boundary; outside-strip gameplay is covered by targeted geometry/engine/prediction tests and the direct fixture.

Single-run CPU observations: strict mean 2.903 ms / p95 15.044 ms / max 245.769 ms; margin mean 2.721 ms / p95 14.089 ms / max 208.887 ms. Kills were 12 vs 15; both HUMAN deaths were TRAIL_CUT. This is a stability smoke test, not evidence of balance or performance improvement. Raw report: .local/wall-margin-r56.json.

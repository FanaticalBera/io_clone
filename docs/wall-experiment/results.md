# Wall escape experiment — 2026-10-07

Branch: codex/experiment-wall-grace, based on master bca0375. Master and the discarded territory-awareness experiment are unchanged.

## Rule

Opt-in only: development/test practice uses ?experimentWall=grace. Missing/strict parameters retain immediate lethal walls; production ignores the opt-in. Online rooms retain their existing rule.

- The existing point collision and exact inside-boundary clamp are unchanged. No collision-radius change, invisible outside margin, automatic bounce, or indefinite wall sliding.
- First contact opens a 0.2-second window (6 ticks at 30 Hz), measured from the exact contact subtick. Actual rotation continues at 9 rad/s. Holding outward dies at the deadline; movement that genuinely escapes remains alive.
- Escape does not refill or restart the window. Returning to a wall after its deadline is immediately lethal unless recharged.
- Recharge requires continuous unblocked movement, with both endpoints at least one hex centre spacing (sqrt(3) * side = 55.43 world units) from every actual boundary segment, for one second (30 ticks).
- Budgets are per match and life ID. A new life receives a fresh budget. WeakMap storage is released with the match; no persistent profile, schema or public participant fields are added.
- HUMAN/BOT use the same rule. AI code, AI/cosmetic RNG, decision interval, movement speed, input thresholds and turning rate are unchanged.
- Existing subtick trail-cut priority, capture cuts, territory loss, kill credit and RunResult resolution remain active during grace.

## Presentation

A single reusable Graphics object emphasizes actual boundary segments within three hex centre spacings. A steady dark line replaces blinking/haptics. Geometry is taken from map.boundaryEdges, including jagged corners. Terrain/trail ownership rendering is unchanged.

Self position prediction can continue rotation and input replay while clamped in opt-in mode. It predicts movement only; life/death remains authoritative. Online does not enable this mode, so no cosmetic/timer protocol extension or reconnect change is introduced by this experiment. Snapshot-serialized/offline save-and-resume would need an explicit policy-state restoration design before shipping this rule there.

## Compare and play

- /docs/wall-experiment/: paired deterministic simulation with identical spawn, inputs and 48-world-unit marker reference at the existing gameplay zoom. Timely reverse input, late input, constant outward input and a jagged-edge example; slow replay available.
- /docs/wall-experiment/?play=1&variant=grace: actual Phaser renderer, 48 IMAGE marker, existing joystick/keyboard/mouse input, R56 and 1 HUMAN + 15 BOT. Starts near the boundary. Switch to strict to compare. This fixture never calls reward/profile storage.
- /?experimentWall=grace&experimentSeed=4: complete practice using the normal menu and game. Use ?experimentWall=strict&experimentSeed=4 for the original rule.

## Validation

Core/Server: 76 files, 440 tests passed in final run (10 new wall tests). Checks include exact .2-second contact-to-death duration, escape/rotation, repeated contact without refill, distance/time refill, new life/match isolation, HUMAN/BOT and slot 15, prediction/authority agreement, every R5 boundary segment, capture-cut and territory-loss deaths during grace. The original strict wall tests remain unchanged.

Browser: comparison plus actual drill and complete R56/16 practice, at 844x390, 640x320 and 568x320. Timely input survives; holding outward differs by exactly .2 seconds. Page errors zero; no document overflow; controls remain accessible; repeated variant switches reuse one boundary-highlight Graphics object. Real touch events on the joystick are included, in addition to deterministic input timing.

Type checking includes the experiment page. Production build checked; the existing large-bundle warning remains. Full original online E2E suite is not part of this isolated practice experiment; existing server/unit regressions are run.

Screenshots are local: .local/wall-compare-{width}.png and .local/wall-drill-{width}.png. These are emulated browser viewport checks, not a physical-phone usability verdict. Final adoption requires the user's wall-side expansion feedback; no merge is performed.

Server verification: 3006 listens on 0.0.0.0; HTTP 200 confirmed through the current PC Ethernet address 211.195.177.137. The previous 192.168.137.1 hotspot address is not currently assigned to this PC.

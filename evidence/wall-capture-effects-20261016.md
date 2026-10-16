# Wall capture and premium marker effects — 2026-10-16

Base: master `a16469c7e3207d11472ab7ab2e1c6f2bd0b0c8aa`.

## Wall capture correction

The base reported an intermediate notch cell during wall movement, but the engine overwrote it with the final head cell before staging trails. Reverse travel could also change padded flanks in the next tick's start probe without reporting the notch at all. Both paths left a hole in a physically closed loop.

The engine now freezes all intermediate contacts and provisional trails in the same simultaneous batch. Direct cuts still precede captures, dead attackers can receive simultaneous credit, and a surviving intermediate home visit can close a trail. The start probe reports the same connecting notch as an ordinary crossing.

- Real steering, normal speed, no injected trails or immunity: rectangle, islands and cross, both directions; all six loops capture an initially neutral interior cell.
- Intermediate provisional mutual cuts are independent of participant array order.
- Intermediate contact cuts a returning opponent before its same-time capture.
- Existing home-return margin remains 10; bot personalities, rewards, map geometry and network protocol are unchanged.

## Appearance-preserving effect work

- Cache static capture tile positions, wave delays, border angles and border colours. Animated tile appearance, brightness and movement still use the current time.
- Invalidate cached data when the effect, map, theme, owner colour or wave dimensions change; weak effect keys allow expired captures to be collected. Populate only tiles visited by the drawing path.
- Skip particle-point allocation for markers whose capture theme emits no particles.
- Clean up shared particle emitters, pending blooms, followers and lifecycle handlers on scene shutdown/destruction.
- No changes to particle counts, animation duration, frame limits, resolution or effect strength.

## Validation

- Client, server and tests TypeScript checks passed.
- Full Vitest run: 116 files, 1,147 ordinary passes and 8 expected failures; no unexpected failures (338.50 seconds).
- Browser: premium cache drawing/lifecycle, real R56/16 practice captures and mobile capture fixture — all three passed (16.4 seconds).
- Additional comparison loads the original master renderer and candidate in the same Chromium scene. All 22 themes, three owner colours and five animation times produce identical Graphics drawing commands after initializing both renderers.
- Desktop forced-redraw sample, 272 drawn cells, 20 redraws per theme: original mean 0.1955 ms; candidate mean 0.1730 ms (about 11.5% lower). This measures CPU command preparation for this fixture; it is not phone FPS, GPU time or thermal improvement. Cold-cache preparation is not included in these timings.
- Local browser verification used a localhost-only Vite harness with explicit dependency prebundling and worktree directories excluded from discovery. No product assertions were disabled.
- Web build and offline Android debug build passed. APK signature and package identity verified; vibration permission remains present.

APK: `artifacts/wall-capture-effects-20261016/HEXHOLD-20261016-wall-capture-effects.apk`.

SHA-256: `8B5DE61D381F58ABBDBD035AF45DFEBE9C6B7D1E842E809D109104B08E4FED96`.

Not yet validated: physical-device play or sustained phone heat with the new marker effects. The APK was built, not installed on a device during this task.

Detailed local outputs: `.local/wall-effects-fix-20261016/marker-before-after-browser.json` and `marker-cache-browser.json`.

# Six.io 1.1.8 drag control comparison

**Current status:** following the supplied movement report, actual direction and
target direction are now separated in authority and prediction. Both integrate
the same fixed-step steering function, now at 9rad/s following U-turn feedback.
The recent-path experiment, fixed-origin restoration and subsequent accepted-
stroke reanchoring were all rejected on mobile. The user confirmed that PC mouse
steering feels good while mobile screen drag fails even in local practice.
Mobile touch now uses the same character-to-pointer-position calculation as PC
mouse, including its 18 CSS-pixel exclusion radius and 2° heading filter. The
camera and avatar coordinates are taken from the same rendered frame. Movement
stays at 4.2 cells/s. This deliberately changes the touch interaction: the point
under the finger chooses a heading from the character, starting on touch-down.
The turn budget exceeds the APK's 6rad/s to reduce the clone's turn radius.
This replaces the rejected input-only steering;
it does not claim identical Six.io feel. See [steering model](steering-model.md).

The user supplied `Six.io 1.1.8.apk` and reported dizziness when changing
direction with HEXHOLD's screen drag control. This is a static code comparison,
not an observation of the original APK running or a physical-device acceptance test.

## Observed in the APK

The UnityFS header identifies Unity 2017.1.2f1. Game code is in
`assets/bin/Data/Managed/Assembly-CSharp.dll`. The analysis reads PE metadata and
method bodies without loading or executing the assembly.

- `Settings..cctor` sets `OldMove = false`.
- `Game.Move`, IL_0089–IL_00C7, uses
  `Vector3.RotateTowards(Direction, NextDirection, 6 * Time.deltaTime, 0)`
  for the local player, then normalizes the result. Thus a 90° turn takes about
  262ms; a 180° turn takes about 524ms. This is an angular speed limit, not
  a delay before turning starts. The bot branch uses 7.5 radians per second.
- `Game.OnPointerMoved` for `ControlType == 0` ignores a swipe when both
  world-space displacement axes are smaller than 0.45. It normalizes the accepted
  displacement as the next direction. This is not a CSS-pixel threshold.
- `Game.CheckSwipe`, IL_009A–IL_00D5, assigns `NextDirection` and updates
  `startPos` to the current touch position after each accepted displacement.
- `Game.UIMoveUp/Down/Left/Right` rejects the exact opposite current cardinal
  direction. This proves a four-button policy, not a universal swipe/joystick
  rejection. HEXHOLD accepts opposite intent and rotates gradually for all devices.
- `Game.Render` positions the camera at the local player's position each frame.
  The source does not add a lagging camera-follow interpolation to that position.
- `Settings.LocalPlayerSpeed = 5.4` uses Unity world units. It cannot be compared
  directly to HEXHOLD's `moveCellsPerSecond = 6` without matching world scale.

## First attempt in HEXHOLD — rejected by the user

Screen drag now advances its anchor on an accepted displacement and turns the
movement input at six radians per second. Those gradually changing unit vectors
are sent through the existing practice/online input path, so the simulated path
and the camera's followed path both turn gradually. Keyboard, joystick and mouse
behavior, movement speed, zoom and camera follow are unchanged in this iteration.

This matches the two identified drag behaviors, rather than claiming identical
overall game feel. HEXHOLD retains its 24 CSS-pixel radial threshold, 2° jitter
filter, 30Hz simulation/input transport and existing presentation interpolation.
The source game's per-frame simulation and thresholds differ. The original also
has territory-dependent zoom, which has not been copied here.

## Verification of the first attempt

Unit checks cover frame-rate-independent angular progression, 90° completion,
shortest-angle wrapping and unit-length directions. Browser checks cover gradual
transmitted turns, small-motion filtering, reversing without lifting the finger,
release retaining the target, and interrupted gestures not resuming.

This first attempt was rejected by the user's physical phone feedback.
Automated checks did not establish comfort or equivalence to Six.io.

Completed checks (2026-10-01): production build and final typecheck passed;
9 relevant unit tests passed; all 8 relevant browser tests passed across the
final runs. An older instant-turn assertion was updated to wait for the new
target direction. A new practice/online drag test recorded intermediate
directions and continuous camera movement in `evidence/drag-turn-camera.json`.
The existing phone test server on `192.168.137.1:3003` returned HTTP 200 and
referenced the newly built JavaScript asset.

## Revision after phone feedback

The first implementation put the source rotation limit in the client input
adapter, which progressively emitted directions over a 30Hz transport. This is
not the original game's per-frame local simulation. It also retained the
previous movement speed and copied swipe reanchoring without matching the
source camera scale and thresholds. Passing progression tests only confirmed
those chosen behaviors; it did not validate their subjective feel.

The revision removes the target-turn state entirely, holds the first touch
origin for the gesture and filters small displacement/angle changes before
directly applying a direction. Releasing the finger retains that direction
without further rotation. Movement is reduced globally to 4.2 cells/s through
shared configuration, including practice, server simulation and presentation.

Production build, 145 core/server tests and 9 browser checks passed. Browser
checks cover a small return motion not unexpectedly reversing direction, no
intermediate delayed steering after a deliberate turn, release retention,
practice/online speed 4.2 and camera continuity. Recorded output is in
`evidence/drag-direct-camera.json`. A temporary friend room on the actual
phone server confirmed its running simulation reports 4.2 cells/s; it was left
after verification. The server serves the new `index-CxyjzOfz.js` asset.

The APK has still not been played by the agent. This direct-turn revision was
subsequently replaced by the shared authoritative/prediction steering model.
The current physical-device feel is still awaiting user acceptance.

## Long-drag attenuation experiment — rejected by the user

With a fixed press origin, a 45px perpendicular movement after a 40px straight
drag requests a 48.37° change. After 400px it requests only 6.42°, which is ignored
by the 8° filter. The same gesture can therefore feel progressively heavier and
leave the character advancing while the user attempts to turn.

That experiment's SwipeSteering consumed a stroke once displacement reached 32px and
updates its anchor even for an unchanged heading. A subsequent perpendicular
45px stroke requests the same 90° goal after both straight-drag lengths. This
follows the reanchoring behavior observed in Game.CheckSwipe without the first
attempt's input-layer rotation ramp or the rejected rolling-path average.
The 32px threshold and 8° filter were clone-specific choices. The user rejected
the result as worse, including unintended movement; the class and those input
rules have now been removed. Its browser input and camera recordings remain in
`evidence/mobile-swipe-input-comparison.json` and `evidence/mobile-swipe-camera.json`.

## Current PC mouse / touch parity revision

PC mouse interpreted the cursor position relative to the character while mobile
interpreted displacement between accepted finger segments. A rightward 80px
stroke followed by a 40px return could therefore request leftward movement in
the mobile segment model. Automated checks had treated that as an intentional
reversal; they did not establish that it matched the user's intent.

InputAdapter.pointAt now routes both screen touch and mouse through the same
GameScene.pointerDirection and heading filter. Release still retains the last
goal, secondary touches are ignored, and an active captured finger cannot be
overridden by mouse movement. The mapping subtracts the rendered avatar's
position from the camera-mapped point, preventing a newer prediction from moving
the control centre between render frames. Physics remains 4.2 cells/s and 9rad/s.
This is a PC-derived interaction, not a claim of equivalent Six.io swipe input.
Parity and camera recordings are in `evidence/mobile-pointer-input-comparison.json`
and `evidence/mobile-pointer-camera.json`; physical phone comfort remains open.

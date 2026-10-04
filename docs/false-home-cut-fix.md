# Remote bridge capture incorrectly kills a surviving home

The mobile recording shows a mint HUMAN capturing a small area while an orange
participant dies far away and loses all territory. The same failure mechanism
was reproduced through normal spawn, steering and `stepMatch()` without editing
owners, trails, positions or life state. The recording itself contains no
authoritative death trace; the regression reproduces the topology and failure,
not the original session's exact input sequence.

## Confirmed cause

Capture first transfers the actual claimed cells. `pruneDisconnectedTerritory()`
then kept whichever remaining component was largest. Capturing a distant bridge
could therefore leave the victim's actual home untouched by the claim, yet erase
that home during pruning because a different component was larger. The later
home-cut check saw the cleanup result and treated it as a lethal attack.

The movement fixture closes a 77-cell extension through relative waypoints
`(2,0) → (11,0) → (11,4) → (0,4) → (0,0)`. The victim either remains on their
original home near `(-1,0)` or exposes a trail near `(-4,0)`. The capturer closes
`(-3,3) → (3,3) → (3,-2) → (2,-2) → (2,3) → (-3,3)` far from that home/trail.

Before the fix, both role orders produced one false `HOME_CAPTURE` death:

| Variant | Actual capture contact | Incorrect pruning result |
| --- | --- | --- |
| Head inside home, tick 388 | No victim trail or head captured | Head cell 571 becomes neutral; victim dies |
| Exposed trail, tick 414 | No victim trail or departure cell captured | Origin 530 becomes neutral; victim dies |

In each case the victim had 77 owned cells before capture, and the distant
largest component still held 44 cells before death cleanup. No direct trail
contact occurred. The death then neutralized all remaining land and credited a
kill, explaining the apparent remote wipeout.

## Correction and behavioral tradeoff

Capture resolution now supplies the real surviving home cell to territory
pruning **after all simultaneous transfers and before pruning**:

- An exposed excursion uses its exact `trailOriginCellId` if still owned.
- A trail created without a movement origin uses the existing first-cell home
  adjacency fallback.
- A head inside home, including a completed return candidate, uses its head
  cell or its surviving adjacent home attachment.
- If no valid home survives, the previous largest-component / lowest-root
  fallback remains in effect, and actual home-cut deaths still resolve normally.

Pruning still retains one component and neutralizes the other disconnected
territory. **Which component survives changes when an intact active home exists:**
that component survives even if a detached remote component is larger. This is
the necessary correction to prevent territory cleanup from inventing a lethal
home loss. Direct trail cuts, trail capture, exact-origin capture, directly
captured disconnected heads, zero-territory deaths and simultaneous priority
remain covered by regression tests.

The earlier pruned-head/exposed-home tests that expected cleanup-induced death
now expect survival and a preserved attachment. Their direct-capture counterparts
still expect exactly one death and kill. The R22 trajectory checksum and the
normal ESCAPE shadow witness were updated because corrected deaths necessarily
change subsequent respawns and BOT observations; BOT policy is unchanged.

## Verification

- Eight new movement cases: Classic/Hold × exposed/inside-home × both role orders.
- Eight server/browser cases use normal HUMAN room creation and authoritative
  movement, with the victim displayed in a mobile viewport. Six intact-home
  cases survive on both clients; two direct-home-capture cases still die once.
- Full unit/regression suite: 250 passing tests in 52 files, two workers.
- Client/server/test type checks and production build pass.
- `CaptureParticipantTrace` now records head/origin ownership before pruning
  and the selected home anchor, separating actual transfer from cleanup.

Reproduce the eight movement cases with:

```text
npx tsx scripts/distant-bridge-audit.ts
```

Raw output is saved under ignored `.local/evidence/distant-bridge-after.json`.
Browser screenshots use `evidence/surviving-{pruned,distant-home,distant-trail}-{A,B}.png`.
Map radius, movement, respawn timing, victory conditions and BOT policy are unchanged.

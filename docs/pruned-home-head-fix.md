# Capture leaves a head on a pruned island

> Historical investigation: the cleanup-induced deaths described below were
> subsequently identified as false positives. See `false-home-cut-fix.md` for
> the corrected home-component selection and current survival expectations.
> Directly capturing the actual disconnected home remains lethal.

The earlier origin fix covered an already exposed trail. It did not cover a
participant who had closed their expansion and was standing on owned land with
no trail. A different participant could capture its connecting neck; territory
pruning then removed the land under the victim while retaining their larger
territory elsewhere. `connectedBefore` excluded that victim because their trail
was empty. The next movement resolution started an orphan trail and left them alive.

## Movement reproduction

`MovementCaptureFixture.runPrunedHomeHead()` uses ordinary spawns, steering inputs
and `stepMatch()`. It never injects owners, trails or body positions. Relative to
the victim's original spawn, the victim closes an expansion through
`(2,0) → (7,0) → (7,2) → (0,2) → (0,0)`, then stays near `(6,1)`.
The capturer completes `(-3,3) → (3,3) → (3,-2) → (2,-2) → (2,3) → (-3,3)`.
There is no direct contact with the victim's trail.

At tick 342, ownership transfer and pruning reduce the victim's 40 owned cells
to 15 elsewhere. The head cell becomes neutral, with no adjacent owned cell.

| Result at capture | Before fix | After fix |
| --- | --- | --- |
| Victim life | ALIVE | DEAD_WAIT |
| Trail | New orphan trail at cell 538; origin null | Empty, including every mask bit |
| Death reason / cause | None | TRAIL_CUT / HOME_CAPTURE |
| Capturer kills / victim deaths | 0 / 0 | 1 / 1 |
| Movement before respawn | Continues | Frozen |

The same failure was reproduced with A/B roles reversed and in Classic/Hold.
The new check snapshots heads standing on their own territory before capture,
then routes heads stranded by capture or pruning through the existing cut/death
pipeline. A head remains alive if its own head cell or an adjacent home cell
survives. Zero-territory deaths retain their existing handling; simultaneous
return candidates remain excluded.

## Follow-up: directly painted home (recorded GIF)

The first fix required a neutral head cell after pruning. The recording exposed
the missing counterpart: capture directly paints the head cell with the
capturer's owner number. That guard incorrectly allowed the same orphan trail
when the head had no surviving home neighbor.

The movement fixture now also extends the capturer's route to `(8,3) → (8,-2)`.
At tick 414, both role orders have an empty victim trail before capture, 40 owned
cells before transfer, 15 owned cells retained elsewhere, an enemy-owned head at
cell 539, and no adjacent home. Before the follow-up fix the victim stays ALIVE,
starts trail `[539]` with null origin, and grants no kill. After the fix it dies
in that capture as `TRAIL_CUT / HOME_CAPTURE`, with one death/kill and no trail.

The head-owner check now uses “no longer the victim's owner,” covering neutral
and enemy-owned cells with the same connection requirement. This does not make
every territory loss or every captured head fatal. Four normal movement control
cases put the victim on their retained home during the same expansion capture;
all remain alive. A separate capture-boundary unit check also preserves survival
for a directly painted head still adjacent to its own home.

The former unit expectation that a disconnected, directly captured head should
survive was corrected to match the requested connection rule. The simultaneous
capture, direct/pending contact, and zero-territory behavior remain covered by
their existing checks.

## Verification

- Twelve movement regression cases cover both roles and both modes, including
  death uniqueness, kill attribution, trail masks and frozen movement until respawn.
- Four browser/server cases use normal room creation, HUMAN participants and
  authoritative server movement; both clients receive the death and kill result.
  Screenshots: `evidence/{pruned,direct}-home-head-{A,B}.png`.
- All 242 unit/regression tests pass with two workers, along with all four
  browser/server cases, type checks and the production build. An initial full
  run overlapped browser/build jobs and hit four timeouts; the bounded-worker
  run completed without assertion failures or timeout changes.
- The independent BOT shadow witness now searches normal decisions with seed 2,
  rather than assuming the pre-fix death timeline at seed 115/tick 3351. It still
  proves an ignored ESCAPE opportunity by physically cutting and returning alive
  on a separate movement branch. BOT behavior is unchanged.

Re-run the movement audit with:

```text
npx tsx scripts/pruned-home-head-audit.ts
npx tsx scripts/pruned-home-head-audit.ts --direct
```

Raw audit output defaults to ignored `.local/evidence/`. Map, movement, respawn,
Classic/Hold victory conditions and BOT policy were not changed.

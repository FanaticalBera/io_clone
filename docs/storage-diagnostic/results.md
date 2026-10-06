# Samsung Internet reward/profile fix — 2026-10-06

## Confirmed phone result

The user tested SamsungBrowser/30.0 (Chrome/143, Android 10) at http://192.168.137.1:3003. The initial native storage diagnostic succeeded: separate probe open/put/commit/read and readonly lookup of the real version-1 profile (12 Coins, 1 processed run). It never writes the real profile.

Live app diagnostics then located the failure after successful DB open: the initial readwrite profile GET timed out after 15 seconds and aborted. After separating ordinary profile reads into readonly transactions, the phone completed the read and UI update and displayed its existing 12 Coins. A raw readwrite GET probe also succeeded and intentionally aborted without modifying data.

Final user confirmation using /?experimentSeed=4: after death, reward saving appeared briefly, then Coins were displayed; returning home showed the added balance. Home loading and actual death reward completion are confirmed on the real Samsung browser. The underlying browser scheduling/connection cause of the earlier GET stall is not established.

## Changes

- Valid profile lookup uses readonly and never puts. Missing/invalid inventory or initial profile creation still re-reads the latest stored value inside an atomic write transaction, preserving concurrent purchases/rewards and the existing repair rules.
- Committed saves settle independently of UI subscribers and BroadcastChannel notification errors. Each subscriber/channel exception is isolated.
- Stalled transactions attempt a full abort after 15 seconds. Successful abort rejects and permits retry; if abort throws because completion already occurred, the completion/abort event remains authoritative. Closed connections invalidate the cached DB.
- Initial profile storage errors and presentation errors are handled separately; a rendering exception after a successful read does not falsely label the wallet unavailable.
- An already-owned and equipped free cat returns the readonly profile without another write. New ownership/equipment still commits atomically and preserves wallet/ledgers.
- Development/test diagnostics at /?debugProfile=1 report storage/UI stages and errors without wallet contents. The write probe only gets and aborts. The panel can collapse to allow mobile play, and is absent at normal URLs and disabled in production.

Reward formula, RunResult, Profile schema, Coins, stats, processedRuns, world ledger, run dedup, gameplay, bot behavior and network payloads are unchanged. No real-profile reset, deletion, localStorage economic fallback, or account system was introduced.

## Verification

- Latest build/typecheck passed.
- Full unit suite: 70 files / 377 tests passed. A concurrent unit/browser attempt hit five simulation deadlines; the isolated rerun with maxWorkers=4 passed all tests without changing timeout configuration.
- Scoped reward/shop browser run: 16/16 passed (6 pending/diagnostic/readonly cases, 4 reward cases, 6 shop cases). Covers abort rollback, retry/dedup, cross-tab purchases/rewards, inventory repair, migration failure, +14/+0 mobile receipts and reload restoration.
- Free-cat preservation cases: 3/3 passed, including first gift/reload, failed-write rollback and concurrent claims, already-equipped gift readonly no-op.
- Diagnostic collapse at 844×390: 1/1 passed; collapse, real Practice click, HUD, reopen, normal URL without panel.
- One earlier shop avatar readiness assertion failed; waiting for actual local-avatar readiness fixed test synchronization, and that case passed in the final 16-case run.
- Live LAN native diagnostic and app trace verified in Chromium; these are not Samsung emulation. Actual Samsung results above came from user-supplied traces and the final gameplay confirmation.
- Mobile LAN Socket.IO handshake succeeds, protocol 5; client port 3003 and backend port 3001 remain running.

Evidence: evidence/storage-diagnostic-mobile.png and evidence/reward-pending-mobile-zero.png. Earlier evidence was restored from the task-start copy; previous marker/game changes are preserved.

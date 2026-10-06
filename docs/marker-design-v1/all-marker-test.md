# All-marker test grant — 2026-10-06

Open in the same Chrome browser used for play:
http://192.168.137.1:3003/?testMarkerGift=all&experimentSeed=4

Grants all 15 catalog markers (4 Basic and 11 approved image designs) in one IndexedDB transaction. Existing Coins, statistics, processedRuns, world ledger, selected marker/color, owned colors and unknown stable marker IDs are preserved. Reopening after all are owned uses readonly lookup without another put. The gift query is removed after success. Normal URLs and production builds do not grant items. Existing cat-only gift behavior remains supported.

Use Shop → owned items → select → equip, then play. The grant is local to the browser/origin where this link is opened; it does not share a wallet across devices or browsers.

Verification: 6 focused unit tests passed; mobile grant/equip/play/reload and rollback/concurrent grant browser cases passed; existing cat cases passed; typecheck/build passed. Actual LAN Chrome mobile-context check saw all 15 owned cards, Coins unchanged, and current equipment preserved.

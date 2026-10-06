# Image marker size comparison — 2026-10-06

Open in Chrome, equip the same image marker in Shop, and compare:
- Original: /?testMarkerGift=all&experimentSeed=4&experimentMarkerSize=42
- Larger: /?testMarkerGift=all&experimentSeed=4&experimentMarkerSize=48

The larger option increases both local Base and fixed Detail layers by 48/42 (14.29%). Frame size is about 15.96 → 18.24 CSS px at zoom .38, or 14.7 → 16.8 CSS px at zoom .35. Slot identification radius remains 25.5 world units, width 2. Basic geometry, other participants, camera zoom, gameplay/collision, Catalog prices and Profile are unchanged. Shop previews retain their existing scale; these links compare the actual gameplay renderer.

The option is development/test only; default/production stays 42 pending visual selection. The existing all-marker gift preserves Coins, ledgers and selected equipment; after claim the size/seed query remains. The draft preview page contains both real-game links without changing historical draft assets.

Verification: 8 focused unit tests passed (size gate and marker catalog/gift); 2 browser cases passed at 844×390 and 568×320, DPR 3, mobile touch. Measured Base/Detail sizes 42 and 48, ring radius 25.5, unchanged bot appearance/zoom, 22 reused textures/2 image objects/16 avatars, all 15 ownership and Coins preserved; switching to Basic Hex remains geometry only. No page errors. Typecheck/build passed.

Screenshots: evidence/marker-size-42-844x390.png, marker-size-48-844x390.png, marker-size-42-568x320.png, marker-size-48-568x320.png.

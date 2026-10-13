// Quota = actual map cells / participating roster, including dead/respawn wait.
// Calibration: R56/14 has9577 cells, so ratios map exactly to256/512/1024.
export const BOT_HOLDING_RISK = Object.freeze({ startQuotaRatio: 256 / (9577 / 14), startMultiplier: 1.15, perDoubling: .1, maxDoublings: 2, maxDangerCells: 7 });
export function holdingRiskThreshold(mapCells, participants) {
    return BOT_HOLDING_RISK.startQuotaRatio * (mapCells / Math.max(1, participants));
}
export function holdingRiskMultiplier(cells, mapCells, participants) {
    const start = holdingRiskThreshold(mapCells, participants);
    return cells < start ? 1 : BOT_HOLDING_RISK.startMultiplier + BOT_HOLDING_RISK.perDoubling * Math.max(0, Math.min(BOT_HOLDING_RISK.maxDoublings, Math.log2(cells / start)));
}
export function holdingDangerDistance(base, cells, mapCells, participants) {
    return cells < holdingRiskThreshold(mapCells, participants) ? base : Math.max(base, Math.min(BOT_HOLDING_RISK.maxDangerCells, Math.ceil(base * holdingRiskMultiplier(cells, mapCells, participants))));
}

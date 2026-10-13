// V disabled; preserve six personality anchors and append up to two damage anchors.
// Approved Phase 2.5 bundles 1/2/3; phase3 remains deferred.
export const BOT_PHASE025 = Object.freeze({ version: 'phase025-reclaim-append-v2', captureWindow: 10,
    regionHalfLife: 20, regionLifetime: 60, regionPerOpponent: 32, regionTotal: 96, boundaryRadius: 3,
    boundarySlots: 2, boundaryTotal: 6, approachLimit: 10, reclaimPerCell: .50, revengePerCell: 0,
    weightedCellCap: 6, territorialMultiplier: 1.5, vengefulMultiplier: 1.5, bonusCap: 6, bonusRatio: .50 });
export const BOT_REPOSITION = Object.freeze({ version: 'phase025-reposition-v1', damageWindow: 10, damageCells: 6, grudgeThreshold: 6, boundaryRadius: 3, minDistance: 11, maxDistance: 20, maxDestinations: 8, weightCap: 6, territorialMultiplier: 1.5, grudgeWeight: 2, vengefulMultiplier: 1.5, distanceCost: .20, maxSeconds: 8, cooldownSeconds: 6, nearWaypoints: 3, nearHeadDistance: 2, pingPongWindow: 30 });

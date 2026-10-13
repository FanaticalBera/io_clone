// Historical controls stay fixed. combined runs the adopted tactical-only Phase 3 cadence; phase retains the old common slot cadence.
export const BOT_VARIANTS = ['baseline', 'fairness', 'cache', 'phase', 'combined'];
export function botVariant(value) {
    return BOT_VARIANTS.includes(value) ? value : 'combined';
}
export function botOptions(variant) { return { fair: variant === 'fairness' || variant === 'combined', cache: variant === 'cache' || variant === 'combined', phase: variant === 'phase' || variant === 'combined' }; }

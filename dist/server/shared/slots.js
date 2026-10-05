export const MAX_MATCH_SLOTS = 16;
// JS bit operations cover all sixteen unsigned bits without BigInt.
export function slotBit(slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_MATCH_SLOTS)
        throw new Error('Invalid slot');
    return 1 << slot;
}
export function hasTrail(mask, slot) { return (mask & slotBit(slot)) !== 0; }

// WIDE/DEEP change aspect ratio, not topology or speed. Hook/asymmetry finish
// through the same bounded, validated home-route search as natural closure.
export function expansionSides(shape, d, length, width, bevel = 1) {
    if (shape === 'WIDE') {
        length = Math.max(1, length - 1);
        width++;
    }
    if (shape === 'DEEP') {
        length++;
        width = Math.max(1, width - 1);
    }
    const leg = (offset, n) => [(d + offset) % 6, n];
    if (shape === 'NATURAL')
        return [leg(0, length), leg(1, width), leg(2, 1 + bevel)];
    if (shape === 'HOOK')
        return [leg(0, length), leg(1, width), leg(3, Math.max(1, Math.floor(length / 2))), leg(2, 1)];
    if (shape === 'ASYMMETRIC')
        return [leg(0, length), leg(1, width), leg(3, Math.max(1, length - 1)), leg(4, Math.max(1, width - 1))];
    if (shape === 'BEVEL')
        return [leg(0, length), leg(1, width), leg(2, bevel), leg(3, length), leg(4, width), leg(5, bevel)];
    return [leg(0, length), leg(1, width), leg(3, length), leg(4, width)];
}
export const EXPANSION_SHAPES = ['RHOMBUS', 'WIDE', 'DEEP', 'ASYMMETRIC', 'HOOK', 'NATURAL'];

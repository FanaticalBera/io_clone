import { MAP_SHAPE, mapCellCount } from './hex.js';
import { DEFAULT_CONFIG } from './config.js';
export const MAP_PRESETS = Object.freeze([
    { id: 'hex', name: '육각', note: '기본 · 14명', config: {} },
    { id: 'rect', name: '직사각', note: '가로로 넓게 · 14명', config: { mapShape: MAP_SHAPE.RECT } },
    { id: 'islands', name: '섬 4개', note: '다리 길목 · 14명', config: { mapShape: MAP_SHAPE.ISLANDS } },
    { id: 'donut', name: '도넛', note: '가운데가 뚫린 링 · 14명', config: { mapShape: MAP_SHAPE.DONUT } },
    { id: 'cross', name: '십자', note: '광장과 네 갈래 · 8명', config: { mapShape: MAP_SHAPE.CROSS, maxSlots: 8 } },
    { id: 'mini', name: '꼬마 육각', note: '빠른 한 판 · 4명', config: { mapRadius: 24, maxSlots: 4 } }
].map(p => Object.freeze(p)));
/** The preset a run was played on, from its board's cell count (each preset's count is distinct). */
export function presetForCellCount(count) {
    for (const p of MAP_PRESETS) {
        const c = { ...DEFAULT_CONFIG, ...p.config };
        if (mapCellCount(c.mapRadius, c.mapShape ?? 0) === count)
            return p.id;
    }
    return null;
}
export const mapPreset = (id) => MAP_PRESETS.find(p => p.id === id) ?? MAP_PRESETS[0];

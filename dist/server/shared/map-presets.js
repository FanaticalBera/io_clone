import { MAP_SHAPE } from './hex.js';
export const MAP_PRESETS = Object.freeze([
    { id: 'hex', name: '육각', note: '기본 · 14명', config: {} },
    { id: 'rect', name: '직사각', note: '가로로 넓게 · 14명', config: { mapShape: MAP_SHAPE.RECT } },
    { id: 'islands', name: '섬 4개', note: '다리 길목 · 14명', config: { mapShape: MAP_SHAPE.ISLANDS } },
    { id: 'donut', name: '도넛', note: '가운데가 뚫린 링 · 14명', config: { mapShape: MAP_SHAPE.DONUT } },
    { id: 'cross', name: '십자', note: '광장과 네 갈래 · 8명', config: { mapShape: MAP_SHAPE.CROSS, maxSlots: 8 } },
    { id: 'mini', name: '꼬마 육각', note: '빠른 한 판 · 4명', config: { mapRadius: 24, maxSlots: 4 } }
].map(p => Object.freeze(p)));
export const mapPreset = (id) => MAP_PRESETS.find(p => p.id === id) ?? MAP_PRESETS[0];

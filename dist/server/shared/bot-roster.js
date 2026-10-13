import { seededRandom, shuffled } from './random.js';
import { BOT_PERSONALITIES } from './bot-identity.js';
// Starter content only. The final 200–300-name review belongs to the last PRD stage.
export const BOT_NICKNAMES = [
    '밤산책', '구름한조각', '느린우체통', '소금빵', '파란연필', '잠든감자', '여름귤', '모서리', '달빛수프', '초록양말', '물결', '오후세시',
    '귤껍질', '단풍우유', '작은우주', '연두콩', '바람개비', '고요한밤', '치즈토스트', '비오는창가', '새벽별', '노란장화', '나무그늘', '햇살조각',
    '민트초코', '별사탕', '달팽이집', '푸른바다', '산책중', '냥발자국', '감자전', '반달', '낮잠시간', '동그라미', '빵끝', '종이배',
    '오리발', '오늘도맑음', '파도소리', '초코라떼', '눈꽃', '골목길', '참새', '봄바람', '따뜻한차', '몽실', '돌멩이', '호두과자'
];
const nicknameKey = (name) => name.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export function assignBotSpecs(count, startSlot = 0, prefix = 'bot', options = {}) {
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(startSlot) || startSlot < 0)
        throw new Error('Invalid bot roster size');
    const seed = options.seed ?? 0, random = seededRandom(seed ^ 0x21b4a3), nameRandom = seededRandom(seed ^ 0x61c87d), existing = options.existing ?? [];
    const counts = new Map(BOT_PERSONALITIES.map(p => [p, existing.filter(e => e.kind === 'BOT' && e.personality === p).length]));
    const usedSlots = new Set(existing.map(p => p.slot)), usedIds = new Set(existing.map(p => p.participantId)), usedNames = new Set(existing.map(p => nicknameKey(p.nickname)));
    const personalities = [];
    for (let i = 0; i < count; i++) {
        const specified = options.overrides?.[startSlot + i]?.personality;
        if (specified !== undefined && !BOT_PERSONALITIES.includes(specified))
            throw new Error('Invalid bot personality override');
        const minimum = Math.min(...counts.values()), choices = BOT_PERSONALITIES.filter(p => counts.get(p) === minimum);
        const selected = specified ?? choices[Math.floor(random() * choices.length)];
        counts.set(selected, counts.get(selected) + 1);
        personalities.push(selected);
    }
    // Overrides are tied to actual slots, so shuffle only unconstrained assignments.
    const free = shuffled(personalities.filter((_, i) => !options.overrides?.[startSlot + i]?.personality), random);
    let freeIndex = 0;
    const pool = shuffled([...new Set(options.nicknamePool ?? BOT_NICKNAMES)], nameRandom);
    let suffix = 1;
    return personalities.map((assigned, i) => {
        const slot = startSlot + i, participantId = prefix + '-' + i, override = options.overrides?.[slot];
        if (usedSlots.has(slot) || usedIds.has(participantId))
            throw new Error('Duplicate bot identity or slot');
        const personality = override?.personality ?? free[freeIndex++] ?? assigned;
        let nickname = override?.nickname ?? pool.find(n => n.trim() && !usedNames.has(nicknameKey(n)));
        if (override?.nickname !== undefined && (!nickname?.trim() || usedNames.has(nicknameKey(nickname))))
            throw new Error('Duplicate or empty bot nickname override');
        while (!nickname) {
            const candidate = '산책' + suffix++;
            if (!usedNames.has(nicknameKey(candidate)))
                nickname = candidate;
        }
        usedNames.add(nicknameKey(nickname));
        usedSlots.add(slot);
        usedIds.add(participantId);
        return { participantId, slot, nickname, kind: 'BOT', personality };
    });
}

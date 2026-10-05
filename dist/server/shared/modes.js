export const GAME_MODE_IDS = ['classic'];
export function isGameModeId(value) { return value === 'classic'; }
export function validateMode(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid game mode');
    const raw = value;
    if (raw.id === 'classic' && Object.keys(raw).every(k => k === 'id'))
        return Object.freeze({ id: 'classic' });
    throw new Error('Invalid game mode');
}
export function createMode(id = 'classic') {
    if (!isGameModeId(id))
        throw new Error('Invalid game mode');
    return validateMode({ id });
}
export const GAME_MODES = {
    classic: { name: 'CLASSIC', subtitle: '완전 점령', description: '맵 전체를 자신의 영토로 만들면 승리', usesControlPoints: false, timeLimitSeconds: null,
        rules: () => '100% 점령', evaluate: (match, atTick) => {
            const winner = match.participants.find(p => p.lifeState === 'ALIVE' && p.territoryCount === match.map.cells.length);
            return winner ? { winnerId: winner.participantId, reason: 'FULL_CAPTURE', atTick } : null;
        } }
};
export function evaluateMode(match, atTick = match.tick) {
    return match.phase === 'RUNNING' ? GAME_MODES[match.gameMode.id].evaluate(match, atTick) : null;
}
export function roundDeadlineTicks(match) {
    const seconds = GAME_MODES[match.gameMode.id].timeLimitSeconds;
    return seconds === null ? null : seconds * match.config.simulationHz;
}
export function territoryPercent(cells, total) { return Math.floor(cells * 1000 / total) / 10; }

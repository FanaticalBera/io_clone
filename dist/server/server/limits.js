const limited = { ok: false, code: 'RATE_LIMITED', message: '요청이 너무 많아요. 잠시 후 다시 시도하세요.' };
export class Limits {
    now;
    log;
    ips = new Map();
    constructor(now, log = () => { }) {
        this.now = now;
        this.log = log;
    }
    direction(session, socket) {
        const now = this.now(), elapsed = Math.max(0, now - session.inputRefillAt);
        session.inputRefillAt = now;
        session.inputTokens = Math.min(60, session.inputTokens + elapsed * 0.03);
        if (session.inputTokens >= 1) {
            session.inputTokens--;
            return true;
        }
        session.inputViolations++;
        if (session.inputViolations === 1 || session.inputViolations === 60)
            this.log('input_limited', { count: session.inputViolations });
        if (session.inputViolations >= 60)
            socket.disconnect(true);
        return false;
    }
    request(session, event, ip, createsRoom, action) {
        if (event === 'room:leave' || event.startsWith('control:'))
            return action();
        const now = this.now();
        session.requestTimes = session.requestTimes.filter(t => now - t < 10000);
        if (session.requestTimes.length >= 5)
            return { ...limited };
        session.requestTimes.push(now);
        session.codeFailures = session.codeFailures.filter(t => now - t < 60000);
        if (event === 'room:join' && session.codeFailures.length >= 10)
            return { ...limited };
        for (const [key, times] of this.ips) {
            const current = times.filter(t => now - t < 60000);
            if (current.length)
                this.ips.set(key, current);
            else
                this.ips.delete(key);
        }
        if (createsRoom) {
            const times = this.ips.get(ip) ?? [];
            if (times.length >= 3)
                return { ...limited };
            times.push(now);
            this.ips.set(ip, times);
        }
        const result = action();
        if (event === 'room:join' && !result.ok && result.code === 'ROOM_NOT_FOUND')
            session.codeFailures.push(now);
        return result;
    }
}
export function allowedOrigin(origin, host, origins) {
    if (!origin)
        return true;
    try {
        const url = new URL(origin);
        if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol))
            return false;
        return url.host === host || origins.includes(origin);
    }
    catch {
        return false;
    }
}
export function validateOrigins(origins) {
    for (const origin of origins) {
        try {
            const url = new URL(origin);
            if (url.origin === origin && ['http:', 'https:'].includes(url.protocol))
                continue;
        }
        catch { }
        throw new Error('Invalid ALLOWED_ORIGINS');
    }
}

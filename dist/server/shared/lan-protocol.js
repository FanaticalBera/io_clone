import { record } from './protocol.js';
export const LAN_MAX_HUMANS = 4;
export const LAN_HEARTBEAT_MS = 1000, LAN_HEARTBEAT_TIMEOUT_MS = 5000, LAN_REQUEST_TIMEOUT_MS = 3000;
/** A guest may step away (background, lost Wi-Fi) this long; a bot steers them home meanwhile, then takes the slot. */
export const LAN_AWAY_GRACE_MS = 30000;
/** The host phone may leave the app this long; the room stays frozen for everyone meanwhile. */
export const LAN_HOST_PAUSE_MS = 60000;
export function encodeFrame(frame) { return JSON.stringify(frame); }
/**
 * A snapshot event whose shared body was serialized once for all receivers (performance PRD N-a): only
 * the receiver's own two fields are appended. Parses to the same object as encodeFrame would produce.
 * `bodyJson` is the snapshot without selfParticipantId and lastAppliedInputSeq.
 */
export function snapshotFrame(event, bodyJson, selfParticipantId, lastAppliedInputSeq) {
    return '{"k":"evt","e":' + JSON.stringify(event) + ',"d":' + bodyJson.slice(0, -1) + ',"selfParticipantId":' + JSON.stringify(selfParticipantId) + ',"lastAppliedInputSeq":' + JSON.stringify(lastAppliedInputSeq) + '}}';
}
export function decodeFrame(raw) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!record(value))
        return null;
    const id = value.id, e = value.e;
    if (value.k === 'req' && Number.isSafeInteger(id) && Number(id) > 0 && typeof e === 'string' && e.length <= 64)
        return { k: 'req', id: Number(id), e, d: value.d };
    if (value.k === 'ack' && Number.isSafeInteger(id) && Number(id) > 0)
        return { k: 'ack', id: Number(id), d: value.d };
    if (value.k === 'evt' && typeof e === 'string' && e.length <= 64)
        return { k: 'evt', e, d: value.d };
    return null;
}
/** Two connected in-memory channel ends: the host's own loopback, and the test transport. */
export function createChannelPair(options = {}) {
    const random = options.random ?? Math.random, latency = options.latencyMs ?? 0;
    const make = () => ({ messages: [], closes: [], backlog: [], closed: false, peer: null });
    const a = make(), b = make();
    a.peer = b;
    b.peer = a;
    const deliver = (to, data) => { if (to.closed)
        return; if (to.messages.length)
        for (const h of to.messages)
            h(data);
    else
        to.backlog.push(data); };
    const shut = (end, reason) => { if (end.closed)
        return; end.closed = true; for (const h of end.closes)
        h(reason); };
    const later = (fn) => latency > 0 ? setTimeout(fn, latency) : queueMicrotask(fn);
    const channel = (self) => ({
        send: (data, opts) => { if (self.closed)
            return; if (opts?.replaceKey && random() < (options.dropReplaceable ?? 0))
            return; const to = self.peer; later(() => deliver(to, data)); },
        close: () => { if (self.closed)
            return; const to = self.peer; shut(self, 'LOCAL_CLOSE'); later(() => shut(to, 'REMOTE_CLOSED')); },
        onMessage: h => { self.messages.push(h); const pending = self.backlog.splice(0); for (const d of pending)
            h(d); },
        onClose: h => { self.closes.push(h); }
    });
    return [channel(a), channel(b)];
}

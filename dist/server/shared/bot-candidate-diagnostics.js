const listeners = new WeakMap();
// Opt-in audit channel, independent of HUD traces and action RNG.
export function watchBotCandidates(memory, listener) { listeners.set(memory, listener); return () => listeners.delete(memory); }
export function botCandidateListener(memory) { return listeners.get(memory); }

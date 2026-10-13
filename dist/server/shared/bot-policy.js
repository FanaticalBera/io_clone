import { BOT_PHASE02 as C } from './bot-phase02-config.js';
// Only a faster cut against the actual threat may bypass planned pursuit limits.
export function survivalCounterAllowed(ownTrail, threat, home, cut) {
    return ownTrail > 0 && Number.isFinite(threat) && Number.isFinite(cut) && home !== null && Number.isFinite(home) && threat <= C.threatEta && threat + C.etaMargin < home && cut <= C.counterEta && cut + C.etaMargin < threat;
}

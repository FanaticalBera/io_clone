import {assignBotSpecs} from '../src/shared/bot-roster.js';
import {BOT_PERSONALITIES,BOT_PERSONALITY_LABELS} from '../src/shared/bot-identity.js';
// Explicit old slot identities keep existing gameplay witnesses and hashes meaningful.
export function botSpecs(count:number,startSlot=0,prefix='bot'){
 const overrides=Object.fromEntries(Array.from({length:count},(_,i)=>[startSlot+i,{personality:BOT_PERSONALITIES[i%4],nickname:BOT_PERSONALITY_LABELS[BOT_PERSONALITIES[i%4]]+' '+i}]));
 const specs=assignBotSpecs(count,startSlot,prefix,{seed:0,overrides});
 return specs.map((p,i)=>({...p,nickname:BOT_PERSONALITY_LABELS[BOT_PERSONALITIES[i%4]]}));
}

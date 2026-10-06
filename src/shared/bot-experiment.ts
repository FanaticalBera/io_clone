// Comparison switches: combined is the adopted runtime default. No protocol fields or RNG consumption.
export const BOT_VARIANTS=['baseline','fairness','cache','phase','combined'] as const;
export type BotVariant=typeof BOT_VARIANTS[number];
export function botVariant(value:string|null):BotVariant {
 return BOT_VARIANTS.includes(value as BotVariant)?value as BotVariant:'combined';
}
export function botOptions(variant:BotVariant){return {fair:variant==='fairness'||variant==='combined',cache:variant==='cache'||variant==='combined',phase:variant==='phase'||variant==='combined'};}

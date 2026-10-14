import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {assignBotSpecs,BOT_NICKNAMES,LEGACY_BOT_NICKNAMES,JAPANESE_BOT_NICKNAMES,BOT_NICKNAME_FLAGS} from '../../src/shared/bot-roster.js';
const reviewed=readFileSync('docs/bot-nickname-pool-review.txt','utf8').trim().split(/\r?\n/);
describe('reviewed bot nicknames',()=>{
 it('keeps the entire reviewed order and the original 48-name prefix',()=>{
  expect(BOT_NICKNAMES).toEqual(reviewed);expect(BOT_NICKNAMES).toHaveLength(288);
  expect(BOT_NICKNAMES.slice(0,48)).toEqual(LEGACY_BOT_NICKNAMES);
  expect(JAPANESE_BOT_NICKNAMES).toEqual(reviewed.slice(228,248));
  expect(new Set(BOT_NICKNAMES.map(n=>n.normalize('NFKC').trim().toLocaleLowerCase('en-US'))).size).toBe(288);
 });
 it('leaves Japanese off by default, and can enable or explicitly disable the reviewed twenty',()=>{
  expect(BOT_NICKNAME_FLAGS.japanese).toBe(false);
  const normal=assignBotSpecs(268,0,'normal',{seed:137}),off=assignBotSpecs(268,0,'normal',{seed:137,japaneseNicknames:false});
  expect(normal).toEqual(off);expect(new Set(normal.map(p=>p.nickname)).size).toBe(268);
  expect(normal.every(p=>BOT_NICKNAMES.includes(p.nickname)&&!JAPANESE_BOT_NICKNAMES.includes(p.nickname))).toBe(true);
  const on=assignBotSpecs(288,0,'on',{seed:137,japaneseNicknames:true});
  expect(new Set(on.map(p=>p.nickname))).toEqual(new Set(BOT_NICKNAMES));
 });
 it('changes only names across feature settings, preserving slots, ids and personality draws',()=>{
  for(const seed of [4,19,73,11,31,47,101,137]){
   const identity=(japaneseNicknames:boolean)=>assignBotSpecs(14,0,'bot',{seed,japaneseNicknames}).map(({nickname,...p})=>p);
   expect(identity(false)).toEqual(identity(true));
   const old=assignBotSpecs(14,0,'bot',{seed,nicknamePool:LEGACY_BOT_NICKNAMES}).map(({nickname,...p})=>p);
   expect(identity(false)).toEqual(old);
  }
 });
});

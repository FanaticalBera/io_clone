import {it,expect} from 'vitest';import {normalizeNickname} from '../../src/shared/names.js';
it('normalizes NFC, whitespace and Unicode code point length',()=>{
 expect(normalizeNickname('  브로   친구  ')).toBe('브로 친구');expect(normalizeNickname('e\u0301')).toBe('é');
 expect(normalizeNickname('😀'.repeat(16))).toBe('😀'.repeat(16));expect(normalizeNickname('😀'.repeat(17))).toBeNull();expect(normalizeNickname('  ')).toBeNull();
 expect(normalizeNickname('<b>브로</b>')).toBe('<b>브로</b>');expect(normalizeNickname(1)).toBeNull();
});

import {describe,it,expect} from 'vitest';
import {encodeBytes,decodeBytes} from '../../src/shared/protocol.js';
import {seededRandom} from '../../src/shared/random.js';

// Performance PRD N-d: chunked encoding must produce exactly the per-byte result.
const reference=(bytes:Uint8Array)=>{let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);};
describe('Performance PRD N-d: encodeBytes',()=>{
 it('matches one character per byte for sizes around the chunk boundary and full maps',()=>{
  const random=seededRandom(5);
  for(const size of [0,1,2,3,100,0x7fff,0x8000,0x8001,0x10000+7,9577,19154]){
   const bytes=Uint8Array.from({length:size},()=>Math.floor(random()*256));
   expect(encodeBytes(bytes)).toBe(reference(bytes));
   expect(decodeBytes(encodeBytes(bytes),size)).toEqual(bytes);
  }
 });
});

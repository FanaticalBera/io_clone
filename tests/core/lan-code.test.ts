import {describe,it,expect} from 'vitest';
import {encodeLanCode,decodeLanCode,normalizeLanCode,LAN_CODE_ALPHABET,LAN_BASE_PORT,LAN_PORT_SLOTS} from '../../src/shared/lan-code.js';
import {seededRandom} from '../../src/shared/random.js';
const samples=(count:number,seed=7)=>{const rnd=seededRandom(seed),pick=(n:number)=>Math.floor(rnd()*n),out:[string,number][]=[];
 for(let i=0;i<count;i++){const kind=i%3,a=kind===0?[10,pick(256),pick(256),pick(256)]:kind===1?[172,16+pick(16),pick(256),pick(256)]:[192,168,pick(256),pick(256)];out.push([a.join('.'),pick(LAN_PORT_SLOTS)]);}
 return out;};
describe('L03: LAN room code',()=>{
 it('round-trips private addresses and every port slot, including range edges',()=>{
  const edges:[string,number][]=[['10.0.0.0',0],['10.255.255.255',7],['172.16.0.0',3],['172.31.255.255',7],['192.168.0.0',0],['192.168.255.255',7],['192.168.43.1',0]];
  for(const [address,slot] of [...edges,...samples(3000)]){
   const code=encodeLanCode(address,slot);
   expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
   expect(decodeLanCode(code)).toEqual({ok:true,address,slot,port:LAN_BASE_PORT+slot});
  }
 });
 it('rejects every single-character substitution without touching the network',()=>{
  for(const [address,slot] of samples(200,11)){
   const code=encodeLanCode(address,slot);
   for(let i=0;i<code.length;i++)for(const c of LAN_CODE_ALPHABET){
    if(c===code[i])continue;const typo=code.slice(0,i)+c+code.slice(i+1),r=decodeLanCode(typo);
    expect(r.ok,`${code} -> ${typo}`).toBe(false);
   }
  }
 });
 it('rejects most adjacent transpositions and nearly all random codes',()=>{
  let swaps=0,caught=0;
  for(const [address,slot] of samples(500,13)){const code=encodeLanCode(address,slot);
   for(let i=0;i<code.length-1;i++){if(code[i]===code[i+1])continue;swaps++;if(!decodeLanCode(code.slice(0,i)+code[i+1]+code[i]+code.slice(i+2)).ok)caught++;}}
  expect(caught/swaps).toBeGreaterThan(0.9);
  const rnd=seededRandom(17);let accepted=0;const trials=50000;
  for(let t=0;t<trials;t++){const code=Array.from({length:8},()=>LAN_CODE_ALPHABET[Math.floor(rnd()*32)]).join('');if(decodeLanCode(code).ok)accepted++;}
  // 1/32 pass the check char, and only ~1.4% of 32-bit addresses are RFC 1918.
  expect(accepted/trials).toBeLessThan(0.002);
 });
 it('gives neighbouring addresses unrelated-looking codes',()=>{
  const a=encodeLanCode('192.168.137.253',0),b=encodeLanCode('192.168.137.166',0),c=encodeLanCode('192.168.137.253',1);
  for(const [x,y] of [[a,b],[a,c]])expect([...x].filter((ch,i)=>ch===y[i]).length).toBeLessThan(4);
 });
 it('normalizes case, spaces and hyphens, and classifies malformed input',()=>{
  const code=encodeLanCode('192.168.0.7',2);
  expect(decodeLanCode(` ${code.slice(0,4).toLowerCase()}-${code.slice(4)} `)).toMatchObject({ok:true,address:'192.168.0.7',slot:2});
  expect(normalizeLanCode(' ab-cd ')).toBe('ABCD');
  for(const bad of ['','ABC','ABCDEFGHJ','ABCDEFG0','ABCDEFGI','ABCDEFG1'])expect(decodeLanCode(bad)).toEqual({ok:false,reason:'FORMAT'});
 });
 it('refuses to encode public addresses, malformed addresses and bad slots',()=>{
  for(const address of ['8.8.8.8','172.32.0.1','192.169.0.1','100.64.0.1','192.168.0','192.168.0.256','192.168.00.1','a.b.c.d'])expect(()=>encodeLanCode(address,0)).toThrow();
  for(const slot of [-1,8,1.5])expect(()=>encodeLanCode('10.0.0.1',slot)).toThrow();
 });
});

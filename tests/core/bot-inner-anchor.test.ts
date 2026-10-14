import {describe,it,expect} from 'vitest';
import {createMatch} from '../../src/shared/game.js';
import {observeBot} from '../../src/shared/bot.js';
import {hexDistance} from '../../src/shared/hex.js';
import {innerExpansionAnchor,BOT_INNER_ANCHOR} from '../../src/shared/bot-inner-anchor.js';
import {botSpecs} from '../bot-fixtures.js';

// A head on the rim owns a blob around it; only an inner-side border qualifies.
function rimScene(headQ:number){
 const m=createMatch({mapRadius:22},4,botSpecs(1)),obs=observeBot(m,m.participants[0].participantId),owner=obs.self.slot+1;
 const head=m.map.byKey.get(headQ+',0')!,owners=new Uint8Array(m.map.cells.length);
 for(const c of m.map.cells)if(hexDistance(c,m.map.cells[head])<=4)owners[c.id]=owner;
 const ring=(id:number)=>m.map.radius-hexDistance(m.map.cells[id],{q:0,r:0});
 return {m,ring,owner,head,obs:{...obs,owners,others:[],trails:[],self:{...obs.self,cellId:head}}};
}
describe('rim inner launch anchor',()=>{
 it('offers an owned inner-side border when the head works the outer rim',()=>{
  const {m,ring,owner,head,obs}=rimScene(21),anchor=innerExpansionAnchor(obs,[]);
  expect(anchor).not.toBeNull();
  expect(obs.owners[anchor!]).toBe(owner);
  expect(m.map.cells[anchor!].neighbors.some(n=>n>=0&&obs.owners[n]!==owner)).toBe(true);
  expect(ring(anchor!)).toBeGreaterThanOrEqual(ring(head)+BOT_INNER_ANCHOR.minRingGain);
  expect(hexDistance(m.map.cells[anchor!],m.map.cells[head])).toBeLessThanOrEqual(BOT_INNER_ANCHOR.prefixLimit);
 });
 it('stays off away from the rim and never repeats an existing anchor',()=>{
  expect(innerExpansionAnchor(rimScene(10).obs,[])).toBeNull();
  const {obs}=rimScene(21),first=innerExpansionAnchor(obs,[])!;
  expect(innerExpansionAnchor(obs,[first])).not.toBe(first);
 });
});

import {createMap,axialKey} from '../../src/shared/hex.js';
import {createState} from '../../src/shared/state.js';
type Coord=[number,number];
const ring:Coord[]=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
export function captureFixture(radius=5) {
 const m=createState({mapRadius:radius},19,[{participantId:'a',slot:0,nickname:'A',kind:'HUMAN'},{participantId:'b',slot:1,nickname:'B',kind:'HUMAN'}],createMap(radius),'m');
 for(const p of m.participants){p.lifeState='ALIVE';p.lifeId=1;}
 const id=(q:number,r:number)=>m.map.byKey.get(axialKey(q,r))!;
 const coords=(cells:Set<number>)=>[...cells].map(i=>{const c=m.map.cells[i];return axialKey(c.q,c.r);}).sort();
 return{m,a:m.participants[0],b:m.participants[1],id,coords};
}


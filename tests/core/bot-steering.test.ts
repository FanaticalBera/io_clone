import {it,expect} from 'vitest';
import {stepMatch} from '../../src/shared/game.js';
import {createMatch} from '../baseline.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../../src/shared/bot.js';
import {botSteeringTarget} from '../../src/shared/bot-steering.js';

function fixture(){
 const m=createMatch({},73,botSpecs(1)),p=m.participants[0];
 p.cellId=m.map.byKey.get('0,0')!;p.position={...m.map.cells[p.cellId].center};p.direction={x:1,y:0};
 const id=(q:number,r=0)=>m.map.byKey.get(`${q},${r}`)!;
 return {m,p,id,obs:observeBot(m,p.participantId)};
}
it('looks farther along a straight run without consuming strategic waypoints',()=>{
 const {m,id,obs}=fixture(),path=[id(1),id(2),id(3)],before=[...path];obs.self.position.y+=8;
 expect(botSteeringTarget(m.map,obs.self,path,m.config,3)).toEqual(m.map.cells[id(3)].center);
 expect(path).toEqual(before);
});
it('never shortcuts a corner, a gap or a reversed route',()=>{
 const {m,id,obs}=fixture();
 for(const path of [[id(1),id(1,1)],[id(1),id(3)],[id(1),id(0)]])
  expect(botSteeringTarget(m.map,obs.self,path,m.config,3)).toEqual(m.map.cells[id(1)].center);
});
it.each(['ATTACK','EXPAND','STEAL','SEEK_POINT','RETURN','ESCAPE'] as const)('%s crosses every planned cell in order under shared movement',goal=>{
 const {m,p,id}=fixture(),memory=createBotMemory(1),path=[id(1),id(2),id(3)];
 p.position.y+=8;memory.plannedLifeId=p.lifeId;memory.path=[...path];memory.goal=goal;memory.nextDecisionTick=1000;
 const visited:number[]=[];
 for(let tick=0;tick<30&&p.cellId!==path.at(-1);tick++){
  const input=getBotInput(observeBot(m,p.participantId),memory)!,before=p.cellId;
  stepMatch(m,new Map([[p.participantId,input]]));if(p.cellId!==before)visited.push(p.cellId);
 }
 expect(visited).toEqual(path);expect(p.lifeState).toBe('ALIVE');
});

import {wallFixture} from './fixture.js';
import {stepMatch,buildView} from '../../src/shared/game.js';
import {nearbyBoundaryEdges,boundaryGeometry,wallMargin} from '../../src/shared/wall-margin.js';
import {gameplayZoom} from '../../src/client/controls.js';
import {createRenderer} from '../../src/client/game-scene.js';
import {InputAdapter} from '../../src/client/input.js';
import {PracticeSession} from '../../src/client/practice.js';
const params=new URLSearchParams(location.search),play=params.get('play')==='1';
const scenario=document.querySelector<HTMLSelectElement>('#scenario')!,replay=document.querySelector<HTMLButtonElement>('#replay')!,slow=document.querySelector<HTMLButtonElement>('#slow')!;
if(play){
 document.querySelector('#panels')!.remove();scenario.innerHTML='<option value="margin">채택본 · ¼칸 여유</option><option value="strict">원본 · 즉사</option>';scenario.value=params.get('variant')==='strict'?'strict':'margin';slow.hidden=true;
 document.querySelector<HTMLAnchorElement>('#drill')!.href='./';document.querySelector('#drill')!.textContent='나란히 비교';replay.textContent='시작';
 const field=document.createElement('div');field.id='field';field.innerHTML='<div id="joystick"><div id="joystick-thumb"></div></div><div id="play-status">시작을 누르고 벽에서 안쪽으로 돌려보세요.</div>';document.body.insertBefore(field,document.querySelector('footer'));
 document.querySelector('#note')!.textContent='갈색 선=최종 사망선 · R56 / 16·48 마커. 기존 조이스틱·키보드·마우스 사용. 이 화면은 보상·프로필을 저장하지 않습니다.';
 const scene=createRenderer('field');scene.setBoundaryHighlight(true);scene.setMarkerAppearance({markerId:'cat',markerColorId:'slot'});
 let practice:PracticeSession,playing=false;
 const input=new InputAdapter(field,(x,y)=>scene.pointerDirection(x,y),direction=>practice?.setDirection(direction));input.attachJoystick(document.querySelector('#joystick')!);input.enabled=false;
 function reset(){practice?.dispose();playing=false;input.enabled=false;
  scene.setWallMargin(scenario.value==='margin');
  practice=new PracticeSession('벽 테스트',(view,id)=>{scene.setView(view,id);const p=view.participants[0];if(p.lifeState!=='ALIVE'){playing=false;input.enabled=false;replay.textContent='다시 시작';}document.querySelector('#play-status')!.textContent=p.lifeState==='ALIVE'?(playing?(scenario.value==='margin'?'이동 중 · 벽 판정 ¼칸 여유':'이동 중 · 원본 벽 판정'):'시작을 누르세요'):'사망 · '+p.deathReason;},{},{seed:4,autoStart:false});
  wallFixture(scenario.value==='margin','push',practice.match);practice.match.participants[0].position={...practice.match.map.cells[practice.match.map.byKey.get('54,0')!].center};practice.match.participants[0].cellId=practice.match.map.byKey.get('54,0')!;practice.match.participants[0].targetDirection=null;
  scene.setView(buildView(practice.match),practice.selfId);input.enabled=true;input.setDirection({x:1,y:0});replay.textContent='시작';document.querySelector('#play-status')!.textContent='방향을 미리 정한 뒤 시작할 수 있어요.';
 }
 const resetButton=document.createElement('button');resetButton.id='drill-reset';resetButton.textContent='처음 위치';replay.after(resetButton);resetButton.onclick=reset;
 replay.onclick=()=>{if(practice.match.participants[0].lifeState!=='ALIVE')reset();playing=!playing;input.enabled=true;practice.setPaused(!playing);if(playing)practice.advance(performance.now());replay.textContent=playing?'정지':'계속';};
 scenario.onchange=()=>{playing=false;reset();};
 const loop=(time:number)=>{if(playing&&!document.hidden)practice.advance(time);requestAnimationFrame(loop);};requestAnimationFrame(loop);
 Object.assign(window,{__WALL_DRILL__:{get:()=>practice?.match,scene:()=>scene,input:(x:number,y:number)=>input.setDirection({x,y}),getInput:()=>({...input.direction})}});
 reset();document.addEventListener('visibilitychange',()=>{practice?.setPaused(document.hidden);input.enabled=playing&&!document.hidden;});
}else{
 let matches=[wallFixture(false,scenario.value),wallFixture(true,scenario.value)],acc=0,last=0,rate=1,elapsed=0;
 const canvases=['strict','margin'].map(id=>document.querySelector<HTMLCanvasElement>('#'+id)!);
 function reset(){matches=[wallFixture(false,scenario.value),wallFixture(true,scenario.value)];acc=0;last=0;elapsed=0;}
 replay.onclick=reset;scenario.onchange=reset;slow.onclick=()=>{rate=rate===1?.35:1;slow.textContent='속도 '+(rate===1?'1×':'0.35×');};
 function arrow(ctx:CanvasRenderingContext2D,x:number,y:number,dx:number,dy:number,color:string){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx*24,y+dy*24);ctx.stroke();}
 function draw(index:number){const m=matches[index],p=m.participants[0],canvas=canvases[index],rect=canvas.getBoundingClientRect(),ratio=devicePixelRatio||1;if(canvas.width!==Math.round(rect.width*ratio)||canvas.height!==Math.round(rect.height*ratio)){canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);}const ctx=canvas.getContext('2d')!,zoom=gameplayZoom(innerWidth),focus=m.map.cells[m.map.byKey.get(m.map.radius+',0')!].center;
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.translate(rect.width*.48-focus.x*zoom,rect.height*.5);ctx.scale(zoom,zoom);
  for(const c of m.map.cells){ctx.beginPath();c.vertices.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fillStyle=m.owners[c.id]===1?'#16cdb1':'#f5f2e9';ctx.fill();ctx.strokeStyle='#d3d2c8';ctx.lineWidth=1;ctx.stroke();}
  ctx.strokeStyle='#9ba5a0';ctx.lineWidth=3;ctx.beginPath();for(const e of m.map.boundaryEdges){ctx.moveTo(e.a.x,e.a.y);ctx.lineTo(e.b.x,e.b.y);}ctx.stroke();
  if(index===1){ctx.fillStyle='#caa78155';ctx.globalCompositeOperation='destination-over';for(const poly of boundaryGeometry(m.map).polygons){ctx.beginPath();poly.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fill();}ctx.globalCompositeOperation='source-over';ctx.strokeStyle='#a8754b';ctx.lineWidth=2;ctx.beginPath();for(const e of boundaryGeometry(m.map).edges){ctx.moveTo(e.a.x,e.a.y);ctx.lineTo(e.b.x,e.b.y);}ctx.stroke();}
  {ctx.strokeStyle='#485d5c';ctx.lineWidth=4;ctx.beginPath();for(const e of nearbyBoundaryEdges(m.map,p.position,Math.sqrt(3)*m.map.side*3)){ctx.moveTo(e.a.x,e.a.y);ctx.lineTo(e.b.x,e.b.y);}ctx.stroke();}
  ctx.fillStyle=p.lifeState==='ALIVE'?'#16cdb1':'#858984';ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.position.x,p.position.y,24,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.setTransform(ratio,0,0,ratio,0,0);const x=rect.width*.48+(p.position.x-focus.x)*zoom,y=rect.height*.5+p.position.y*zoom;const intent=p.targetDirection??p.direction;arrow(ctx,x,y,intent.x,intent.y,'#657b7777');arrow(ctx,x,y,p.direction.x,p.direction.y,'#233330');
  document.querySelector('#'+(index?'margin':'strict')+'-status')!.textContent=p.lifeState==='ALIVE'?'생존 · '+(m.tick/30).toFixed(2)+'초':'벽 사망 · '+(p.deathContext!.eventTick!/30).toFixed(3)+'초';
 }
 function loop(now:number){if(!last)last=now;if(!document.hidden)acc+=Math.min(100,now-last)*rate;last=now;while(acc>=1000/30&&elapsed<60){for(const m of matches)if(m.participants[0].lifeState==='ALIVE'){stepMatch(m);}elapsed++;acc-=1000/30;}for(let i=0;i<2;i++)draw(i);requestAnimationFrame(loop);}requestAnimationFrame(loop);
 Object.assign(window,{__WALL_LAB__:{get:()=>matches.map(m=>({tick:m.tick,life:m.participants[0].lifeState,reason:m.participants[0].deathReason,position:m.participants[0].position,deathTick:m.participants[0].deathContext?.eventTick,margin:wallMargin(m.map)})),reset}});
}

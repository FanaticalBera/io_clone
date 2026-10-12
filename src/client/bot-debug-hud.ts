import type {BotGrudgeTrace} from '../shared/bot-emotion.js';
import {BOT_PHASE02} from '../shared/bot-phase02-config.js';
import {BOT_PHASE025} from '../shared/bot-phase025-config.js';
import type {BotDebugSnapshot} from './bot-debug-model.js';
import {BOT_PERSONALITY_LABELS,SECONDARY_TRAIT_LABELS} from '../shared/bot-identity.js';
const COLORS:Record<string,string>={EXPAND:'#86efac',STEAL:'#fbbf24',SEEK_POINT:'#c4b5fd',ATTACK:'#fca5a5',RETURN:'#93c5fd',ESCAPE:'#f9a8d4',REPOSITION:'#fb923c'};
function grudgeCause(event:BotGrudgeTrace):string {
 switch(event.reason){case 'DEATH':return '나를 처치';case 'CAPTURE':return '영토 '+event.cells+'칸 탈취'+(event.accumulated===undefined?'':' (최근 누적 '+event.accumulated+'칸)');case 'REPEAT_APPROACH':return '내 선에 반복 접근';case 'REPEAT_INTRUSION':return '내 영토에 반복 침입'+(event.upgrade?' (접근 적립 보정)':'');}
}
export class BotDebugHud {
 private root=document.createElement('aside');private rows=document.createElement('div');private detail=document.createElement('pre');
 private buttons=new Map<string,HTMLButtonElement>();private followButton:HTMLButtonElement|null=null;private collapseButton:HTMLButtonElement|null=null;private spectating=false;private following=false;private selected:string|null=null;private timer:number|null=null;private source:(()=>BotDebugSnapshot|null)|null=null;
 constructor(private follow:(id:string|null)=>void=()=>{},private spectate:()=>void=()=>{},private overlay:(data:{matchId:string;damage:number[];expected:number[];actual:number[];slot:number;route?:number[];destination?:number|null}|null)=>void=()=>{}){
  this.root.id='bot-debug-hud';this.root.setAttribute('aria-label','봇 판단 디버그');this.root.hidden=true;
  const title=document.createElement('strong');title.textContent='BOT AI · 0+1+2+2.5 (①②③)';
  const collapse=document.createElement('button');this.collapseButton=collapse;collapse.textContent='접기';collapse.type='button';collapse.onclick=()=>{const hidden=!this.rows.hidden;this.rows.hidden=hidden;this.detail.hidden=hidden;collapse.textContent=hidden?'펼치기':'접기';};
  const followButton=document.createElement('button');this.followButton=followButton;followButton.textContent='선택 봇 따라보기';followButton.type='button';followButton.onclick=()=>{this.following=!this.following;followButton.textContent=this.following?(this.spectating?'전체 판 보기':'내 화면으로'):'선택 봇 따라보기';this.follow(this.following?this.selected:null);};
  const spectator=document.createElement('button');spectator.type='button';spectator.textContent='14봇 관전 시작';spectator.onclick=()=>this.spectate();
  this.root.append(title,collapse,followButton,spectator,this.rows,this.detail);document.body.append(this.root);
 }
 start(source:()=>BotDebugSnapshot|null,spectating=false){this.stop();this.spectating=spectating;this.source=source;this.root.hidden=false;this.render();this.timer=window.setInterval(()=>this.render(),250);}
 stop(){this.buttons.clear();this.rows.hidden=false;this.detail.hidden=false;if(this.followButton)this.followButton.textContent='선택 봇 따라보기';if(this.collapseButton)this.collapseButton.textContent='접기';this.following=false;this.follow(null);this.overlay(null);if(this.timer!==null)clearInterval(this.timer);this.timer=null;this.source=null;this.selected=null;this.root.hidden=true;this.rows.replaceChildren();this.detail.textContent='';}
 private render(){const snapshot=this.source?.();if(!snapshot){this.root.hidden=true;this.overlay(null);return;}this.root.hidden=false;
  if(!snapshot.bots.some(b=>b.participantId===this.selected))this.selected=snapshot.bots[0]?.participantId??null;
  const current=new Set(snapshot.bots.map(b=>b.participantId));for(const [id,button]of this.buttons)if(!current.has(id)){button.remove();this.buttons.delete(id);}
  snapshot.bots.forEach(bot=>{let b=this.buttons.get(bot.participantId);if(!b){b=document.createElement('button');this.buttons.set(bot.participantId,b);this.rows.append(b);}b.type='button';b.dataset.botId=bot.participantId;b.setAttribute('aria-pressed',String(this.selected===bot.participantId));b.style.borderLeftColor=COLORS[bot.goal];
   const trait=bot.identity?SECONDARY_TRAIT_LABELS[bot.identity.secondaryTrait]+(bot.identity.active?'':'(비활성)'):'미배정';
   const risk=bot.trace?.risk?bot.trace.risk.danger?'위험':'낮음':'미평가';
   b.textContent='#'+bot.slot+' '+bot.nickname+' · '+BOT_PERSONALITY_LABELS[bot.personality]+' / '+trait+' · '+bot.goal+' · 대상 '+(bot.attackSlot??'-')+' · 선 '+bot.trailLength+' · 위험 '+risk+' · '+bot.lifeState;
   b.onclick=()=>{this.selected=bot.participantId;if(this.following)this.follow(this.selected);this.render();};});
  const bot=snapshot.bots.find(b=>b.participantId===this.selected);if(!bot)return;
  const reclaim=bot.reclaim.active??bot.reclaim.recent.filter(r=>r.lifeId===bot.lifeId).at(-1);
  const lastRecovered=bot.reclaim.recent.filter(r=>r.lifeId===bot.lifeId&&r.outcome!=='OPEN'&&r.dRaw>0).at(-1);
  this.overlay({matchId:snapshot.matchId,slot:bot.slot,damage:bot.damage.regions.map(c=>c.cellId),route:bot.reposition.route,destination:bot.reposition.active?.target??null,expected:bot.goal==='REPOSITION'||reclaim?.outcome==='LAUNCH_BLOCKED'?[]:reclaim?.expectedCellIds??[],actual:lastRecovered?[...lastRecovered.actualCellIds,...lastRecovered.otherReclaimCellIds]:[]});
  const trace=bot.trace,lines=['seed '+snapshot.seed+' / tick '+snapshot.tick,'#'+bot.slot+' '+bot.nickname+' · life '+bot.lifeId];
  lines.push('지도: 노랑 = 피해 기억 · 하늘색 = 예상 되찾기 · 초록 = 회수해 보유 · 주황 = 재배치 경로/목적지');
  if(reclaim)lines.push('예상 되찾기 '+reclaim.expectedCellIds.length+'칸 → 실제 '+reclaim.actualCellIds.length+'칸 · 예상 밖 회수 '+reclaim.otherReclaimCellIds.length+'칸 · 종료 시 유지 '+reclaim.retainedCells+'칸',
   'D 계획 #'+reclaim.id+' · t'+reclaim.selectedTick+' · '+reclaim.outcome+' · D raw +'+reclaim.dRaw.toFixed(2)+' · 적용 +'+reclaim.appliedBonus.toFixed(2));
  if(bot.identity){const i=bot.identity.individual;lines.push('개인차: 확장 '+i.expansionScale.toFixed(2)+' / 위험 가중 '+i.riskScale.toFixed(2)+' / 탈취 '+i.stealScale.toFixed(2)+' / 공격 '+i.attackChance.toFixed(2)+' / 방어 '+i.defenseBonus);}
  lines.push('pressure '+bot.emotion.pressure.toFixed(2)+' · 선 위협 '+Number(bot.emotion.lineThreat)+' · 최근 피해 '+bot.emotion.recentDamage.toFixed(2),'1위 점유율 격차 '+(bot.shareGap*100).toFixed(1)+'%p (표시 전용)', '계획 추격 예약: '+snapshot.director.reservations.map(r=>'#'+snapshot.bots.find(b=>b.participantId===r.attackerId)?.slot+' → '+r.targetId).join(', '),'생존 역공 '+(bot.attackSurvival?'예':'아니오')+' · 예외 '+snapshot.director.stats.survival+' / 상한 중 예외 '+snapshot.director.stats.survivalOverCap);
  const age=(event:BotGrudgeTrace)=>Math.max(0,(snapshot.tick-event.tick)/snapshot.simulationHz).toFixed(1)+'초 전';
  lines.push('원한:');
  if(!bot.emotion.grudges.length)lines.push('  없음');
  for(const g of bot.emotion.grudges){lines.push('  #'+g.slot+' '+g.nickname+' · '+g.amount.toFixed(2)+' / 점수 +'+g.bonus.toFixed(2)+(g.valuable?' · 가치 기준 충족':''));
   const e=g.lastEvent;lines.push(e?'    최근 적립: '+grudgeCause(e)+' · +'+e.delta.toFixed(2)+' · '+age(e)+' · life '+e.lifeId+(e.lifeId!==bot.lifeId?' (부활 전)':''):'    진단 시작 전 적립 (원인 기록 없음)');
  }
  lines.push('최근 원한 사건 (최대 12건):');
  if(!bot.grudgeEvents.length)lines.push('  없음');
  for(const e of [...bot.grudgeEvents].reverse()){
   const result=e.ignored==='BELOW_THRESHOLD'?'미적립 (누적 '+BOT_PHASE02.captureCells+'칸 미만)':e.ignored==='COOLDOWN'?'미적립 (재적립 대기 '+BOT_PHASE02.captureCooldown+'초)':'원한 +'+e.delta.toFixed(2)+(e.delta===0?' (상한)':'');
   lines.push('  #'+e.slot+' '+e.nickname+' · '+grudgeCause(e)+' · '+result+(e.observedCells===undefined?'':' · 근처 '+e.observedCells+' / 관측 밖 '+((e.cells??0)-e.observedCells))+' · '+age(e)+' · life '+e.lifeId+(e.lifeId!==bot.lifeId?' (부활 전)':''));
  }
  lines.push('탈취는 전역 공개 소유권으로 기록 · pressure는 내 주변 '+snapshot.observationRange+'칸 피해만 · 원한은 부활 후 유지');
  lines.push('최근 '+BOT_PHASE025.captureWindow+'초 피해 / 원한 누적:');
  if(!bot.damage.opponents.length)lines.push('  없음');
  for(const d of bot.damage.opponents)lines.push('  #'+d.slot+' '+d.nickname+' · 누적 '+d.accumulated+'/'+BOT_PHASE02.captureCells+' · 전체 '+d.total+' / 근처 '+d.local+' / 관측 밖 '+(d.total-d.local)+' · 재적립 대기 '+d.cooldownRemaining.toFixed(1)+'초');
  const regions=bot.damage.regions;lines.push('피해 구역 '+regions.length+'/'+BOT_PHASE025.regionTotal+'칸 · 기억 무게 '+regions.reduce((sum,c)=>sum+c.weight,0).toFixed(2));
  for(const c of [...regions].sort((a,b)=>b.tick-a.tick||a.cellId-b.cellId).slice(0,6))lines.push('  cell '+c.cellId+' ('+c.q+','+c.r+') · #'+snapshot.bots.find(b=>b.participantId===c.attackerId)?.slot+' · 무게 '+c.weight.toFixed(2));
  if(reclaim){
   const outcomes:Record<string,string>={OPEN:'실행 중',CAPTURE:'점령 완료',HOME:'귀환 (점령 없음)',REPLANNED:'다른 확장으로 교체',ATTACK:'공격으로 전환',DEATH:'사망',LIFE_RESET:'새 생명',CENSORED:'측정 종료',REPOSITION:'피해 쪽 재배치로 전환'};
   lines.push('되찾기 결과: 계획 #'+reclaim.id+' · t'+reclaim.selectedTick+' · '+outcomes[reclaim.outcome],
    '  일반 탈취 '+reclaim.ordinaryStolenCells+'칸 / 중립 '+reclaim.neutralCells+'칸 · 계획 생성 D raw +'+reclaim.dRaw.toFixed(2)+' · 적용 +'+reclaim.appliedBonus.toFixed(2));
   for(const transition of reclaim.interruptions)lines.push('  실행 변경 t'+transition.tick+' · '+transition.goal+' · '+transition.reason);
  }else lines.push('되찾기 결과: 아직 확장 계획 없음');
  for(const r of bot.reclaim.recent.filter(r=>r.lifeId===bot.lifeId&&r.dRaw>0&&r.id!==reclaim?.id).slice(-3).reverse())lines.push('최근 D 계획 #'+r.id+' · t'+r.selectedTick+' · '+r.outcome+' · 예상 '+r.expectedCellIds.length+' → 실제 '+r.actualCellIds.length+'칸 · 예상 밖 회수 '+r.otherReclaimCellIds.length+'칸');
  const label=(id:string|null)=>{const b=snapshot.bots.find(b=>b.participantId===id);return b?'#'+b.slot+' '+b.nickname:id??'없음';};
  const deaths=new Map(bot.reclaim.recent.filter(r=>r.lifeId===bot.lifeId).flatMap(r=>r.relatedDeaths).map(e=>[[e.tick,e.victimId].join(':'),e]));
  for(const e of [...deaths.values()].sort((a,b)=>a.tick-b.tick).slice(-4))lines.push('관련 사망 t'+e.tick+' · '+label(e.victimId)+' · 처치자 '+label(e.killerId)+' · '+e.cause+' (되찾기와 별개)');
  const rp=bot.reposition,active=rp.active,last=rp.last,selection=rp.selection;
  if(active)lines.push('REPOSITION → cell '+active.target+' · 가해자 '+label(active.attackerId)+' · 내부 '+active.distance+'칸 · 실제 이동 '+active.movedCells+'칸 · 경과 '+((snapshot.tick-active.startedTick)/snapshot.simulationHz).toFixed(1)+'초');
  else lines.push('REPOSITION: '+(selection?.reason??'미평가')+' · 봇 전체 재시도 대기 '+Math.max(0,(rp.cooldownUntil-snapshot.tick)/snapshot.simulationHz).toFixed(1)+'초');
  if(last)lines.push('최근 재배치 t'+last.startedTick+'→'+last.endedTick+' · '+last.outcome+' · 목적지 '+last.target+' · 실제 이동 '+last.movedCells+'칸');
  if(selection)lines.push('재배치 경계 평가 '+selection.examined+'/8 · 전체 경계 중 10칸 이내 '+selection.within10+' · 20칸 내 경로 없음 '+selection.beyond20OrDisconnected+' · 근접 차단 '+selection.nearBlocked);
  lines.push('재배치 집계: 도착 '+rp.stats.arrivals+' / 중단 '+rp.stats.aborts+' / A→B→A 왕복 '+rp.stats.pingPong);
  if(trace?.emotion)lines.push('이번 판단 조절값: 확장 '+trace.emotion.expansionScale.toFixed(2)+' / 위험 '+trace.emotion.riskScale.toFixed(2));
  const launch=bot.departure,lastLaunch=launch?.lastBlock;
  lines.push('출발 차단: '+(launch?.blocks??0)+'회 · 봇 생존 분당 '+(launch?.blocksPerAliveMinute??0).toFixed(2)+' · 연속 '+(launch?.consecutiveBlocks??0)+' / 최대 '+(launch?.maxConsecutiveBlocks??0),'출발 후보 탈락: '+(launch?.candidateRejected??0)+' · 사전 필터 생략 '+(launch?.prefilterSkipped??0));
  if(lastLaunch){const d=lastLaunch.result;lines.push('최근 출발 경계 tick '+lastLaunch.tick+' · '+(lastLaunch.fallback?'LAUNCH_BLOCKED':'LAUNCH_NO_SAFE_OWNED_ROUTE')+' · '+d.reason+' #'+d.enemySlot,'첫 노출 칸 '+d.firstCell+' · 진입 '+d.entrySeconds?.toFixed(3)+'초 · 사전 필터 '+d.prefilterCells+'칸 · 대체 경로 '+(lastLaunch.fallback?.join('→')??'없음'));}
  if(trace){lines.push('최근 판단 tick '+trace.tick+' · 선택: '+trace.reason,'안전 개입: '+(trace.safetyOverride??'없음'),'선 근처 적 거리: '+(trace.risk?.nearestEnemyToTrail??'관측 없음'),'최근 공격 후보: '+trace.attacks.slice(0,12).map(a=>'#'+a.slot+' '+a.reason).join(', '));
   }else lines.push('아직 판단 기록 없음');
  const plan=bot.planTrace;
  if(plan){lines.push('현재 계획을 세운 판단 tick '+plan.tick+' · 선택: '+plan.reason,'계획 생성 시 공격 후보:');
   for(const a of plan.attacks.slice(0,12))lines.push('  대상 #'+a.slot+' cell '+a.target+' · '+a.reason+(a.score===undefined?'':' · 점수 '+a.score.toFixed(1))+(a.grudgeBonus===undefined?'':' · 원한 +'+a.grudgeBonus.toFixed(2)+' / 공격 계수 '+a.attackChance?.toFixed(3))+(a.otherReservations===undefined?'':' · 다른 예약 '+a.otherReservations+' / 배율 '+a.reservationFactor));
   const response=plan.expansionPlan?.response;
   if(response)lines.push('선택 확장: 기본 '+response.baseScore.toFixed(2)+' · 되찾기 D '+response.reclaimWeight.toFixed(2)+' / raw +'+response.reclaimRaw.toFixed(2)+' · 복수 V '+response.revengeWeight.toFixed(2)+' / raw +'+response.revengeRaw.toFixed(2)+' · 적용 +'+response.bonus.toFixed(2)+' · D/V 중첩 '+response.overlapCells+'칸 (의도된 중첩)');
   lines.push('피해 대응 출발 경계: '+(plan.damageBoundary?.anchors.join(', ')||'없음')+' · 내부 10칸으로 도달 불가 경계 '+(plan.damageBoundary?.unreachable??0));
   lines.push('평가한 계획 상위 5개:');for(const p of plan.expansionScores?.slice(0,5)??[])lines.push('  '+p.goal+' '+(p.shape??'')+' · '+p.score.toFixed(1)+(p.departureBlocked?' [출발 탈락 '+p.departureBlocked+']':'')+(p.response?' (기본 '+p.response.baseScore.toFixed(1)+' / 대응 +'+p.response.bonus.toFixed(2)+')':''));
   lines.push('확장 거절 집계: '+JSON.stringify(plan.expansionRejected??{}));
  }else lines.push('아직 계획 생성 기록 없음');
  lines.push('최근 상태 전환:');for(const h of bot.history)lines.push('  t'+h.tick+' life '+h.lifeId+' '+h.from+' → '+h.to+' · '+h.reason);
  this.detail.textContent=lines.join('\n');
 }
}

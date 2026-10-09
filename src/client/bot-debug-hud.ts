import type {BotDebugSnapshot} from './bot-debug-model.js';
import {BOT_PERSONALITY_LABELS,SECONDARY_TRAIT_LABELS} from '../shared/bot-identity.js';
const COLORS:Record<string,string>={EXPAND:'#86efac',STEAL:'#fbbf24',SEEK_POINT:'#c4b5fd',ATTACK:'#fca5a5',RETURN:'#93c5fd',ESCAPE:'#f9a8d4'};
export class BotDebugHud {
 private root=document.createElement('aside');private rows=document.createElement('div');private detail=document.createElement('pre');
 private buttons=new Map<string,HTMLButtonElement>();private followButton:HTMLButtonElement|null=null;private collapseButton:HTMLButtonElement|null=null;private following=false;private selected:string|null=null;private timer:number|null=null;private source:(()=>BotDebugSnapshot|null)|null=null;
 constructor(private follow:(id:string|null)=>void=()=>{}){
  this.root.id='bot-debug-hud';this.root.setAttribute('aria-label','봇 판단 디버그');this.root.hidden=true;
  const title=document.createElement('strong');title.textContent='BOT AI · 0+1';
  const collapse=document.createElement('button');this.collapseButton=collapse;collapse.textContent='접기';collapse.type='button';collapse.onclick=()=>{const hidden=!this.rows.hidden;this.rows.hidden=hidden;this.detail.hidden=hidden;collapse.textContent=hidden?'펼치기':'접기';};
  const followButton=document.createElement('button');this.followButton=followButton;followButton.textContent='선택 봇 따라보기';followButton.type='button';followButton.onclick=()=>{this.following=!this.following;followButton.textContent=this.following?'내 화면으로':'선택 봇 따라보기';this.follow(this.following?this.selected:null);};
  this.root.append(title,collapse,followButton,this.rows,this.detail);document.body.append(this.root);
 }
 start(source:()=>BotDebugSnapshot|null){this.stop();this.source=source;this.root.hidden=false;this.render();this.timer=window.setInterval(()=>this.render(),250);}
 stop(){this.buttons.clear();this.rows.hidden=false;this.detail.hidden=false;if(this.followButton)this.followButton.textContent='선택 봇 따라보기';if(this.collapseButton)this.collapseButton.textContent='접기';this.following=false;this.follow(null);if(this.timer!==null)clearInterval(this.timer);this.timer=null;this.source=null;this.selected=null;this.root.hidden=true;this.rows.replaceChildren();this.detail.textContent='';}
 private render(){const snapshot=this.source?.();if(!snapshot){this.root.hidden=true;return;}this.root.hidden=false;
  if(!snapshot.bots.some(b=>b.participantId===this.selected))this.selected=snapshot.bots[0]?.participantId??null;
  const current=new Set(snapshot.bots.map(b=>b.participantId));for(const [id,button]of this.buttons)if(!current.has(id)){button.remove();this.buttons.delete(id);}
  snapshot.bots.forEach(bot=>{let b=this.buttons.get(bot.participantId);if(!b){b=document.createElement('button');this.buttons.set(bot.participantId,b);this.rows.append(b);}b.type='button';b.dataset.botId=bot.participantId;b.setAttribute('aria-pressed',String(this.selected===bot.participantId));b.style.borderLeftColor=COLORS[bot.goal];
   const trait=bot.identity?SECONDARY_TRAIT_LABELS[bot.identity.secondaryTrait]+(bot.identity.active?'':'(비활성)'):'미배정';
   const risk=bot.trace?.risk?bot.trace.risk.danger?'위험':'낮음':'미평가';
   b.textContent='#'+bot.slot+' '+bot.nickname+' · '+BOT_PERSONALITY_LABELS[bot.personality]+' / '+trait+' · '+bot.goal+' · 대상 '+(bot.attackSlot??'-')+' · 선 '+bot.trailLength+' · 위험 '+risk+' · '+bot.lifeState;
   b.onclick=()=>{this.selected=bot.participantId;if(this.following)this.follow(this.selected);this.render();};});
  const bot=snapshot.bots.find(b=>b.participantId===this.selected);if(!bot)return;
  const trace=bot.trace,lines=['seed '+snapshot.seed+' / tick '+snapshot.tick,'#'+bot.slot+' '+bot.nickname];
  if(bot.identity){const i=bot.identity.individual;lines.push('개인차: 확장 '+i.expansionScale.toFixed(2)+' / 위험 가중 '+i.riskScale.toFixed(2)+' / 탈취 '+i.stealScale.toFixed(2)+' / 공격 '+i.attackChance.toFixed(2)+' / 방어 '+i.defenseBonus);}
  if(trace){lines.push('최근 판단 tick '+trace.tick+' · 선택: '+trace.reason,'안전 개입: '+(trace.safetyOverride??'없음'),'선 근처 적 거리: '+(trace.risk?.nearestEnemyToTrail??'관측 없음'),'평가한 공격 후보:');
   for(const a of trace.attacks.slice(0,12))lines.push('  대상 #'+a.slot+' cell '+a.target+' · '+a.reason+(a.score===undefined?'':' · 점수 '+a.score.toFixed(1)));
   lines.push('평가한 계획 상위 5개:');for(const p of trace.expansionScores?.slice(0,5)??[])lines.push('  '+p.goal+' '+(p.shape??'')+' · '+p.score.toFixed(1));
   lines.push('확장 거절 집계: '+JSON.stringify(trace.expansionRejected??{}));
  }else lines.push('아직 판단 기록 없음');
  lines.push('최근 상태 전환:');for(const h of bot.history)lines.push('  t'+h.tick+' life '+h.lifeId+' '+h.from+' → '+h.to+' · '+h.reason);
  this.detail.textContent=lines.join('\n');
 }
}

import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {START_ANCHORS,scaledStartAnchors,createMap,region,hexDistance} from '../src/shared/hex.js';
import {DEFAULT_CONFIG} from '../src/shared/config.js';
import type {runInitialSpawnExperiment} from './initial-spawn-experiment.js';
type Run=ReturnType<typeof runInitialSpawnExperiment>;
const radii=[32,36,40],seeds=[4,19,73,115],mean=(v:number[])=>v.length?v.reduce((s,n)=>s+n,0)/v.length:null;
const stats=(v:number[])=>v.length?{mean:mean(v)!,min:Math.min(...v),max:Math.max(...v)}:null;
const f=(v:number|null|undefined,d=2)=>v==null?'미도달 / 검증되지 않음':v.toFixed(d);
const rawFiles:{path:string;bytes:number;sha256:string}[]=[];
function load(radius:number,placement:'fixed'|'scaled'):Run[]{
 const path=`.local/evidence/initial-spawn/R${radius}-${placement}.json`,raw=readFileSync(path),runs:Run[]=JSON.parse(raw.toString()).runs;rawFiles.push({path,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')});
 if(runs.length!==4||JSON.stringify(runs.map(r=>r.seed))!==JSON.stringify(seeds))throw new Error('Missing paired seeds');
 for(const r of runs){if(r.durationSeconds!==300||r.mode.id!=='classic'||r.placement!==placement||r.radius!==radius||JSON.stringify({...r.config,mapRadius:22})!==JSON.stringify(DEFAULT_CONFIG))throw new Error('Unequal experiment configuration');
  if(JSON.stringify(r.anchors)!==JSON.stringify(placement==='fixed'?START_ANCHORS:scaledStartAnchors(radius)))throw new Error('Wrong actual anchor geometry');}
 return runs;
}
function aggregate(runs:Run[]){const departures=runs.flatMap(r=>r.initialDeparture.participants);return {
 initialPairDistanceHex:runs[0].initialPairDistanceHex,firstDirectTrailContactSeconds:stats(runs.flatMap(r=>r.firstDirectTrailContactSeconds===null?[]:[r.firstDirectTrailContactSeconds])),firstKillSeconds:stats(runs.flatMap(r=>r.firstKillSeconds===null?[]:[r.firstKillSeconds])),
 deathsBySeconds:Object.fromEntries([60,180,300].map(t=>[String(t),stats(runs.map(r=>r.deathsBySeconds[String(t)]))])),deathsPerMatchMinute:mean(runs.map(r=>r.deathsBySeconds['300']/5)),meanPairDistanceHex:mean(runs.flatMap(r=>r.meanPairDistanceHex===null?[]:[r.meanPairDistanceHex])),
 fiveMinutePeakLeaderPercent:stats(runs.map(r=>r.peakLeaderPercent)),fiveMinuteEndLeaderPercent:stats(runs.map(r=>r.endLeaderPercent)),meanTrailCellsPerAliveParticipant:mean(runs.flatMap(r=>r.meanTrailCellsPerAliveParticipant===null?[]:[r.meanTrailCellsPerAliveParticipant])),
 initialDeparture:{centerDistanceHex:10,firstLifeOnly:true,total:departures.length,reached:departures.filter(p=>p.status==='REACHED').length,diedBeforeThreshold:departures.filter(p=>p.status==='DIED_BEFORE_THRESHOLD').length,notReachedUnverified:departures.filter(p=>p.status==='NOT_REACHED_UNVERIFIED').length,observedSeconds:stats(departures.flatMap(p=>p.seconds===null?[]:[p.seconds]))},
 perSeed:runs.map(({samples,deathTimes,wallSeconds,...r})=>r)};}
const comparison=radii.map(radius=>({radius,totalCells:1+3*radius*(radius+1),anchors:scaledStartAnchors(radius),fixed:aggregate(load(radius,'fixed')),scaled:aggregate(load(radius,'scaled'))}));
// Preserve the previous fixed-anchor experiment as historical evidence.
const historicalCrossChecks:number[]=[];
for(const radius of [32,36]){const path=`evidence/map-size/R${radius}.json`;if(!existsSync(path))continue;const historical:Run[]=JSON.parse(readFileSync(path,'utf8')).runs;
 for(const r of comparison.find(c=>c.radius===radius)!.fixed.perSeed){const old=historical.find(x=>x.seed===r.seed&&(x as any).mode==='classic') as any;if(!old)throw new Error('Missing historical baseline seed');
  if(old.firstDirectTrailContactSeconds!==r.firstDirectTrailContactSeconds||old.samples.find((s:any)=>s.seconds===300).leaderPercent!==r.endLeaderPercent)throw new Error('Fixed baseline differs from historical first five minutes');}
 historicalCrossChecks.push(radius);
}
const verifiedRadii:number[]=[];
for(let radius=22;radius<=64;radius++){const map=createMap(radius),all=new Set<number>();if(map.anchors.length!==8)throw new Error('Missing anchors');
 for(const anchor of map.anchors)for(const id of region(map,anchor,2)){if(id<0||all.has(id)||map.controlPoints.some(p=>p.cellId===id))throw new Error('Unsafe initial zone');all.add(id);}
 if(all.size!==152)throw new Error('Incomplete zones');verifiedRadii.push(radius);
}
const views=['desktop','landscape'].map(device=>({device,...JSON.parse(readFileSync(`evidence/initial-spawn/${device}-view.json`,'utf8'))}));
for(const v of views)if(v.records.length!==3||v.errors.length)throw new Error('Incomplete visual verification');
const earlyContact=JSON.parse(readFileSync('evidence/initial-spawn/early-contact-R36.json','utf8'));
mkdirSync('evidence/initial-spawn',{recursive:true});writeFileSync('evidence/initial-spawn/summary.json',JSON.stringify({date:'2026-10-03',method:'24 normal Classic 8-BOT simulations; 4 paired seeds; fixed before source modification; scaled after; 300 seconds each',baselineRevision:'901091f',defaultRadius:22,changedGameplay:'initial anchors only; dev/test R40 added',configuration:DEFAULT_CONFIG,verifiedRadii,historicalCrossChecks,rawFiles,comparison,earlyContact,views},null,2));
const lines=[
 '# 초기 배치 확대 실험 — 2026-10-03','',
 '## 변경 범위와 기존 문제','',
 `기존 START_ANCHORS는 R22의 고정 좌표 8개였다. 반경을 늘려도 최초 본체 사이 평균 ${f(comparison[0].fixed.initialPairDistanceHex.mean)}칸·최소 5칸은 그대로였다. 외곽 여유와 이후 respawn 공간은 늘어나지만 처음부터 넓게 퍼져 시작하는 효과는 없었다. 초기 배치의 영향만 비교하기 위해 이번에는 시작 anchor만 확대했다. 기본 R22, 최대 8명, BOT 정책, 속도/회전, 승리조건, spawnRadius/buffer, respawn 지연과 선택 알고리즘은 유지했다.`,'',
 '## 확대 방식과 배치 검증','',
 '`scale = mapRadius / 22`로 원래 q/r를 확대한 뒤 cube 좌표 q/r/s의 합이 0이 되도록 기존 hex 반올림 방식을 공유한다. q/r를 각각 독립 반올림하지 않는다. 좌표 순서와 seed shuffle 방식도 유지하며 별도 배치 framework나 respawn anchor 제약을 추가하지 않았다. R22의 좌표와 정상 movement/capture/respawn 시계열 해시는 기존과 일치했다.','',
 '| 반경 | 실제 anchor 좌표 (기존 순서) | 초기 최소 / 평균 hex 거리 |','|---|---|---:|',
 ...[22,32,36,40].map(radius=>{const a=scaledStartAnchors(radius),d:number[]=[];for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)d.push(hexDistance(a[i],a[j]));return `| R${radius} | ${a.map(p=>`(${p.q}, ${p.r})`).join(' · ')} | ${Math.min(...d)} / ${f(mean(d))} |`;}),'',
 'R22~R64의 모든 정수 반경에서 anchor 8개, 각 영역 19칸, 총 152칸을 검사했다. 맵 이탈·영역 겹침·control point 겹침은 모두 0건이다. 후보 세 개에서는 Classic/Hold, 시드 4/19/73/115 및 참가자 입력 순서를 바꿔도 slot별 배정이 결정적이었다. R3처럼 37칸밖에 없는 맵에는 8×19칸 비중첩 배치가 수학적으로 불가능하다. 그런 작은 설정은 정상 초기화에서 거부하며 배치 조건을 완화하지 않는다.','',
 '## 짧은 paired 비교 실험','',
 'R32/R36/R40 × fixed/scaled × 시드 4/19/73/115, 각 5분: 총 24회·120분의 게임 시간이다. 기존 source 상태에서 fixed 기준을 먼저 수집하고 수정 후 동일 스크립트로 scaled를 수집했다. 정상 createMatch와 BOT 입력/stepMatch만 사용하며 소유권·trail·위치·goal은 조작하지 않았다. fixed/scaled 라벨과 실제 anchor가 일치하는지도 검사한다. 초기 seed 배정 순서는 두 조건에서 같다. R32/R36의 fixed 첫 접촉과 5분 점유율은 지난 20분 실험의 해당 시드 결과와도 일치했다.','',
 '평균은 독립 시드 4개를 같은 비중으로 집계한다. 사망 수는 8명 전체의 누적 수이며 1/3/5분을 별도 기간으로 더하지 않는다. 직접 trail contact는 EXISTING/PENDING_TRAIL_CONTACT로 실제 사망이 일어난 첫 사건이다. 보호로 무시된 접촉은 이 지표에 포함되지 않는다. 최초 kill은 capture에 의한 절단도 포함하므로 최초 직접 접촉보다 빠를 수 있다.','',
 '| 반경 / 배치 | 초기 최소 / 평균 거리 | 첫 직접 접촉 평균(초) | 첫 kill 평균(초) | 1 / 3 / 5분 누적 사망 평균 | 5분 사망/분 |','|---|---:|---:|---:|---:|---:|',
 ...comparison.flatMap(c=>(['fixed','scaled'] as const).map(p=>{const g=c[p];return `| R${c.radius} / ${p} | ${g.initialPairDistanceHex.min} / ${f(g.initialPairDistanceHex.mean)} | ${f(g.firstDirectTrailContactSeconds?.mean)} | ${f(g.firstKillSeconds?.mean)} | ${[60,180,300].map(t=>f(g.deathsBySeconds[String(t)]?.mean,2)).join(' / ')} | ${f(g.deathsPerMatchMinute)} |`;})),'',
 '| 반경 / 배치 | 5분 평균 본체 간 거리 | 5분 이내 최고 점유율 평균 / 최대 | 정확히 5분의 1등 점유율 평균 | ALIVE 1명당 평균 trail 칸 |','|---|---:|---:|---:|---:|',
 ...comparison.flatMap(c=>(['fixed','scaled'] as const).map(p=>{const g=c[p];return `| R${c.radius} / ${p} | ${f(g.meanPairDistanceHex)} | ${f(g.fiveMinutePeakLeaderPercent?.mean)}% / ${f(g.fiveMinutePeakLeaderPercent?.max)}% | ${f(g.fiveMinuteEndLeaderPercent?.mean)}% | ${f(g.meanTrailCellsPerAliveParticipant)} |`;})),'',
 '거리 평균은 매초 ALIVE 본체 사이 모든 쌍의 hex 거리 평균을 시간 평균한 값이다. trail은 모든 tick에서 ALIVE 참가자의 칸 수를 합산하고 ALIVE participant-tick 수로 나누며, 영토 안의 0칸도 포함한다. respawn 이후도 포함된 5분 전체의 지표이므로 initial spacing과 구분한다.','',
 '### 최초 시작 영역을 벗어나는 시간','',
 '초기 중심에서 hex 거리 10칸 이상(반경 2인 시작 영역 바깥으로 최소 8칸)을 처음 넘은 시점을 측정했다. 최초 life의 ALIVE 상태에서만 기록하고, 사망 후 멀리 respawn한 것을 초기 출발로 세지 않는다. 같은 step에서 사망한 경우도 살아서 벗어난 기록으로 세지 않는다. 먼저 죽은 참가자를 0초나 실패 시간으로 넣지 않았다.','',
 '| 반경 / 배치 | 도달 / 최초 life에서 먼저 사망 / 미도달 | 도달자 평균 [최소–최대] 초 |','|---|---:|---:|',
 ...comparison.flatMap(c=>(['fixed','scaled'] as const).map(p=>{const d=c[p].initialDeparture;return `| R${c.radius} / ${p} | ${d.reached} / ${d.diedBeforeThreshold} / ${d.notReachedUnverified} (총 ${d.total}명) | ${f(d.observedSeconds?.mean)} [${f(d.observedSeconds?.min)}–${f(d.observedSeconds?.max)}] |`;})),'',
 '### 초기 충돌이 반드시 늦어지지는 않는 이유','',
 '원래 형태에는 `(17,0)`과 `(12,5)` 및 반대편의 가까운 두 쌍이 있다. 최소 중심 거리는 fixed 5칸 → R32 7칸 → R36 8칸 → R40 9칸으로 늘어나지만 세 후보 모두 기존 BOT 관찰 범위 12칸 이내다. 형태를 보존한 비례 확대가 균등 간격 배치가 되는 것은 아니다. 이 결과로 BOT 정책이나 배치 형태를 추가 변경하지 않았다.','',
 `R36 시드 115는 실제 정상 movement에서 ${f(earlyContact.event.deathContext.eventTick/30)}초에 bot-2가 bot-7의 EXISTING_TRAIL_CONTACT를 일으켰다. 초기 중심은 (28,0), (20,8), 거리 8칸이다. 전체 평균 거리가 늘어도 가까운 쌍·시드 배정·기존 경로 선택에 의해 첫 충돌이 더 빨라질 수 있음을 재현했다. R40 시드 115는 첫 kill 27.67초, 첫 직접 접촉 41.83초로 두 지표가 다른 사건이다. 원본 요약에 실제 death 원인·좌표를 보관했다.`, '',
 'R32/R36에서는 평균 첫 접촉 지연이 일관되게 개선되지 않았고, R32의 5분 사망 수는 오히려 증가했다. R40은 평균 첫 접촉이 늦어지고 5분 사망 수가 줄었다. 4개 시드의 짧은 비교이므로 통계적 확정이나 인간 체감의 대리 결과로 보지 않는다. 1등 50~100% 후반이나 Hold 유지 난이도는 이번 짧은 Classic 실험으로 검증하지 않았다.','',
 '## 시드별 첫 접촉과 사망 수','',
 '| 반경 / 배치 | 시드 | 첫 직접 접촉 / 첫 kill(초) | 1 / 3 / 5분 누적 사망 |','|---|---:|---:|---:|',
 ...comparison.flatMap(c=>(['fixed','scaled'] as const).flatMap(p=>c[p].perSeed.map(r=>`| R${c.radius} / ${p} | ${r.seed} | ${f(r.firstDirectTrailContactSeconds)} / ${f(r.firstKillSeconds)} | ${[60,180,300].map(t=>r.deathsBySeconds[String(t)]).join(' / ')} |`))),'',
 '## 카메라 / 미니맵 관찰','',
 '1280×800 데스크톱과 844×390 가로 터치 viewport에서 후보 세 개를 실제 Chromium/Phaser로 렌더링했다. 세 맵 모두 zoom 0.38, 플레이어 추적 중심 오차 <0.01, 오류 0건이다. camera/CSS/minimap 코드는 수정하지 않았다. 이는 자동 렌더링 확인이며 실제 스마트폰 GPU 성능과 인간 체감 평가는 아니다.','',
 '| viewport / 반경 | 보이는 world 폭 × 높이 | 미니맵 이웃 cell 간 CSS px | ground texture 폭 × 높이 | 확인된 MAX_TEXTURE_SIZE |','|---|---:|---:|---:|---:|',
 ...views.flatMap(v=>v.records.map((r:any)=>`| ${v.device} / R${r.radius} | ${f(r.worldView.width,0)} × ${f(r.worldView.height,0)} | ${f(r.minimapHexNeighborCssPixels)} | ${r.groundTexture.width} × ${r.groundTexture.height} | ${r.canvasMaxTextureSize??'검증되지 않음'} |`)),'',
 `후속 항목: 로컬 카메라의 world view 크기는 mapRadius와 무관하다. 큰 맵의 전체 경계·상대 위치를 한 화면에서 파악할 수 없고, 외곽 시작 위치에서는 맵 밖 배경이 보이는 부분도 있다. 144×122 CSS px의 미니맵은 전체 경계가 잘리지 않지만 R40의 이웃 칸 간격이 약 ${f(views[0].records.find((r:any)=>r.radius===40).minimapHexNeighborCssPixels)}px까지 줄어 작은 영토 형태를 읽기 어렵다. 기존 미니맵은 상대 본체 마커와 노출 trail, camera view 범위를 그리지 않으므로 멀리 떨어진 상대 위치·현재 시야 범위를 파악하기 어렵다. 크기 조절/확대, 상대·시야 마커는 별도 후속 후보이며 이번에는 구현하지 않았다.`,'',
 'R40 ground texture의 폭은 약 4,496px다. 이번 Chromium의 texture 제한 안에서는 렌더링됐지만 MAX_TEXTURE_SIZE=4096인 실제 기기는 아직 검증되지 않았다. 한 장짜리 바닥 texture가 큰 맵에서 제한을 넘는지 물리 기기 검증 및 필요 시 분할을 후속으로 확인한다. 인원·렌더링 chunk 규칙도 이번에는 바꾸지 않았다.','',
 '## 직접 비교 실행','',
 '개발 Vite는 현재 5173에서 실행 중이다. 각 링크에서 봇 연습을 시작하면 scaled anchor를 사용한다. 브라우저에 맵 반경을 저장하지 않으며 URL 없이 접속하면 R22다. 운영 빌드는 실험 URL/환경변수를 무시한다.','',
 ...radii.map(r=>`- [R${r} / 동일 seed 4](http://127.0.0.1:5173/?experimentMapRadius=${r}&experimentSeed=4&debug=1)`),'',
 'Classic은 기본 모드이고 Hold는 시작 메뉴에서 선택한다. 새 게임마다 같은 seed를 사용할 수 있지만 1 HUMAN+7 BOT 연습은 이번 8 BOT 시뮬레이션과 memory 초기화·사람 입력이 달라 동일 경로를 기대하지 않는다. R32/R36/R40 온라인 Hold에서도 두 HUMAN 브라우저와 여섯 BOT가 정상 snapshot을 공유하는 것을 확인했다.','',
 '개발용 온라인 서버를 별도로 실행한다면 `MAP_EXPERIMENT_RADIUS=40`, `MAP_EXPERIMENT_SEED=4`를 설정해 source 서버를 실행한다. Windows가 2972~3071을 TCP 예약한 현재 기기에서는 기존 3001/3002/3004 포트에 새 서버를 열 수 없었다. 이번 네트워크 검사는 로컬 테스트 설정으로 5312/5314를 사용했고 게임 규칙은 변경하지 않았다. 연습 링크는 이 온라인 포트와 관계없이 사용할 수 있다.','',
 '수동 체크: 시작 직후 상대 거리, 확장 여유와 큰 loop 선택지, 상대를 찾는 이동 시간, 20~30%의 세력감, 외곽 청소 부담, 미니맵 가독성을 각각 비교한다. scaled 상태의 사람 플레이 결과가 나오기 전에는 최종 기본값을 결정하지 않는다. 이전 R32 수동 평가는 fixed 배치였으므로 이번 배치에서는 새 비교가 필요하다.','',
 '## 검증과 보관','',
 '전체 core/server 49파일 229검사가 통과했고 R22 실제 movement 해시도 유지됐다. 타입 검사·production build, 후보 세 개의 렌더링/미니맵, 개발 R40 선택, 기본 R22 복귀, production override 무시, 후보 세 개의 실제 두 HUMAN+여섯 BOT Hold snapshot 검증이 통과했다.','',
 '큰 원본 시계열은 `.local/evidence/initial-spawn/`에 보관해 Git에서 제외한다. 작은 summary JSON에는 시드별 결과·원본 SHA256·좌표·정확한 설정을 포함하며 보고서와 함께 버전 관리할 수 있다. 기존 map-size 보고서는 fixed 배치에서 측정한 과거 결과로 유지하며 scaled 결과로 덮어쓰지 않는다.','',
 '- [실험 요약 JSON](../evidence/initial-spawn/summary.json)',
 '- [R36 초반 접촉 재현](../evidence/initial-spawn/early-contact-R36.json)',
 ...views.map(v=>`- [${v.device} 실제 화면 측정](../evidence/initial-spawn/${v.device}-view.json): `+radii.map(r=>`[R${r}](../evidence/initial-spawn/${v.device}-R${r}.png)`).join(', ')),''
];
mkdirSync('docs',{recursive:true});writeFileSync('docs/initial-spawn-experiment-results.md',lines.join('\n'));
console.log(JSON.stringify(comparison.map(c=>({radius:c.radius,fixedContact:c.fixed.firstDirectTrailContactSeconds?.mean,scaledContact:c.scaled.firstDirectTrailContactSeconds?.mean,spacing:c.scaled.initialPairDistanceHex,deathsFixed:c.fixed.deathsBySeconds,deathsScaled:c.scaled.deathsBySeconds})),null,2));

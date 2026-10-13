import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
const root=resolve('../bot-loop-ceiling-range-exploration'),protocol=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const arms=(process.argv.find(v=>v.startsWith('--arms='))?.slice(7)??protocol.arms.join(',')).split(',');
const run=(file:string,args:string[])=>execFileSync(process.execPath,['--import','tsx','scripts/'+file,...args],{stdio:'inherit',windowsHide:true});
for(const arm of arms){
 console.error('START '+arm+' BOT120 instrumented');
 run('bot-growth-analysis.ts',['--root='+root,'--arm=native','--source-key='+arm+'Audit','--name='+arm,'--ticks=3600','--loop-ceiling-audit']);
 console.error('START '+arm+' observer-free proof');
 run('bot-quiet-growth-neutral-audit.ts',['--root='+root,'--arm='+arm,'--ticks=3600']);
 console.error('START '+arm+' HUMAN180 native');
 run('bot-growth-analysis.ts',['--root='+root,'--arm=native','--source-key='+arm,'--name='+arm+'-human','--ticks=5400','--human']);
 run('medium-attack-audit.ts',['--source='+protocol[arm],'--phase01','--phase02','--out='+resolve(root,arm+'-medium.json')]);
 console.error('DONE '+arm);
}

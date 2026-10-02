const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
// Restore only historical tracked artifacts overwritten by this task's tests.
// Git is read-only; stdout writes directly to a file descriptor for large zips.
const screenshots=new Set(['evidence/classic-victory-popup.png','evidence/death-cause-contact.png','evidence/death-cause-home-A.png','evidence/death-cause-home-B.png','evidence/field-scale-desktop.png','evidence/field-scale-mobile.png','evidence/mobile-swipe-settings-2026-10-02.png','evidence/reported-kill-impact.png','evidence/reported-territory-split.png','evidence/reported-wall-impact.png','evidence/respawn-held-drag.png','evidence/respawn-held-joystick.png','evidence/respawn-held-trackpad.png']);
const changed=cp.execFileSync('git',['-c','core.safecrlf=false','diff','--name-only','-z']).toString().split('\0').filter(Boolean);
const targets=changed.filter(p=>p==='debug.log'||p==='evidence/T35-resources.json'||p.startsWith('test-results/')||p.startsWith('node_modules/.vite/vitest/')||screenshots.has(p));
for(const p of targets){const absolute=path.resolve(p),root=process.cwd()+path.sep;if(!absolute.startsWith(root))throw new Error('Outside workspace');fs.mkdirSync(path.dirname(absolute),{recursive:true});const fd=fs.openSync(absolute,'w');try{cp.execFileSync('git',['show','HEAD:'+p],{stdio:['ignore',fd,'pipe']});}finally{fs.closeSync(fd);}}
console.log(JSON.stringify({restored:targets.length,paths:targets}));

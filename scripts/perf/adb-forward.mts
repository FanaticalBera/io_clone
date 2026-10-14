// Forwards the HEXHOLD WebView DevTools socket of a connected phone to a local port, so
// scripts/perf/run-autoplay.mts can drive it over CDP. Debug APKs enable WebView debugging.
//   node scripts/perf/adb-forward.mts --adb <serial> [--port 9222] [--launch 1]
import {execFileSync} from 'node:child_process';
const args=new Map<string,string>();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i].replace(/^--/,''),process.argv[i+1]??'');
const adbPath=args.get('adb-path')??process.env.ADB??'adb',serial=args.get('adb'),port=args.get('port')??'9222';
const adb=(...c:string[])=>execFileSync(adbPath,[...(serial?['-s',serial]:[]),...c],{encoding:'utf8',timeout:20000});
if(args.get('launch')==='1'){adb('shell','am','start','-n','com.hexhold.game/.MainActivity');await new Promise(r=>setTimeout(r,4000));}
const pid=adb('shell','pidof','com.hexhold.game').trim().split(/\s+/)[0];
if(!pid)throw new Error('HEXHOLD is not running on the device');
const sockets=adb('shell','cat','/proc/net/unix').split(/\r?\n/).map(l=>/@(webview_devtools_remote_\d+)/.exec(l)?.[1]).filter(Boolean) as string[];
const socket=sockets.find(s=>s.endsWith('_'+pid));
if(!socket)throw new Error('No WebView DevTools socket for pid '+pid+' (is this a debug APK?) found: '+sockets.join(', '));
adb('forward','tcp:'+port,'localabstract:'+socket);
console.log(JSON.stringify({pid,socket,cdp:'http://127.0.0.1:'+port}));

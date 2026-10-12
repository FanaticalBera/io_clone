import {defineConfig,type Plugin} from 'vite';
// APK builds run with no internet: drop the Google Fonts link (fonts-bundled.ts ships them) and bundle woff2 only.
const offlineFonts:Plugin={
 name:'hexhold-offline-fonts',enforce:'pre',
 transformIndexHtml:html=>html.replace(/<link rel="preconnect" href="https:\/\/fonts\.[^>]*>/g,'').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g,''),
 transform:(code,id)=>id.includes('@fontsource')&&id.endsWith('.css')?code.replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g,''):undefined
};
export default defineConfig(({mode})=>({
 server:{port:5173,proxy:{'/socket.io':{target:mode==='test'?'http://127.0.0.1:3002':'http://127.0.0.1:3001',ws:true},'/healthz':'http://127.0.0.1:3001'}},
 plugins:mode==='apk'?[offlineFonts]:[],
 build:{outDir:'dist/client',sourcemap:false}
}));

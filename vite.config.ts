import {defineConfig} from 'vite';
export default defineConfig(({mode})=>({
 server:{port:5173,proxy:{'/socket.io':{target:mode==='test'?'http://127.0.0.1:3002':'http://127.0.0.1:3001',ws:true},'/healthz':'http://127.0.0.1:3001'}},
 build:{outDir:'dist/client',sourcemap:false}
}));

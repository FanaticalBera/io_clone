import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'territory-effects.spec.ts',timeout:60000,workers:1,
 use:{baseURL:'http://127.0.0.1:5174',trace:'off',screenshot:'only-on-failure'},
 webServer:[
  {command:'node node_modules/vite/bin/vite.js --mode test --port 5174 --host 127.0.0.1 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:false,timeout:30000},
  {command:'node tests/e2e/large-world-production.mjs',url:'http://127.0.0.1:3010/healthz',reuseExistingServer:false,timeout:30000}
 ]
});
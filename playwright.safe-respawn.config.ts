import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'safe-bot-respawn.spec.ts',timeout:30000,workers:1,
 use:{baseURL:'http://127.0.0.1:5310',trace:'retain-on-failure',screenshot:'only-on-failure'},
 outputDir:'.local/safe-respawn-browser-results',
 webServer:[
  {command:'node node_modules/vite/bin/vite.js --mode test --port 5310 --host 127.0.0.1 --strictPort',url:'http://127.0.0.1:5310',reuseExistingServer:false,timeout:30000},
  {command:'node node_modules/vite/bin/vite.js preview --outDir .local/safe-respawn-client-build --port 5311 --host 127.0.0.1 --strictPort',url:'http://127.0.0.1:5311',reuseExistingServer:false,timeout:30000}
 ]
});

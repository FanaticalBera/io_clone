import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',testMatch:['modes.spec.ts','practice.spec.ts','landscape.spec.ts','run.spec.ts','reward.spec.ts','reward-pending.spec.ts','shop.spec.ts','marker-design.spec.ts','marker-size.spec.ts','profile.spec.ts','player-color.spec.ts'],timeout:60000,workers:1,
 use:{baseURL:'http://127.0.0.1:5174',trace:'retain-on-failure',screenshot:'only-on-failure'},
 outputDir:'.local/reward-browser-results',
 webServer:{cwd:process.cwd(),command:'node node_modules/vite/bin/vite.js --mode test --port 5174 --host 127.0.0.1 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:false,timeout:30000}
});
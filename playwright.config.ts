import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',testIgnore:'**/large-world.spec.ts',timeout:60000,fullyParallel:false,workers:1,
 use:{baseURL:'http://127.0.0.1:3001',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:[
  {command:'npm start',url:'http://127.0.0.1:3001/healthz',reuseExistingServer:false,timeout:30000},
  {command:'npm run dev:client',url:'http://127.0.0.1:5173',reuseExistingServer:false,timeout:30000},  {command:'vite --mode test --port 5174 --host 127.0.0.1',url:'http://127.0.0.1:5174',reuseExistingServer:false,timeout:30000}
 ]
});



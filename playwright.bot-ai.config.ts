import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',testMatch:'bot-phase01.spec.ts',timeout:60000,workers:1,
 use:{baseURL:'http://127.0.0.1:5178',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:[
  {command:'vite --mode test --port 5178 --host 127.0.0.1',url:'http://127.0.0.1:5178',reuseExistingServer:false,timeout:30000},
  {command:'vite preview --port 5312 --host 127.0.0.1',url:'http://127.0.0.1:5312',reuseExistingServer:false,timeout:30000}
 ]
});

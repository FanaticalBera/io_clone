import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',testMatch:'wall-experiment.spec.ts',workers:1,timeout:60000,use:{baseURL:'http://127.0.0.1:3006',hasTouch:true,isMobile:true,deviceScaleFactor:2},webServer:{command:'vite --host 0.0.0.0 --port 3006 --strictPort --mode test',url:'http://127.0.0.1:3006',reuseExistingServer:true}});

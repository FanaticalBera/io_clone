import base from '../playwright.config';
export default {
 ...base,
 testDir:'../tests/e2e',
 outputDir:'../test-results',
 webServer:(base.webServer as {reuseExistingServer?:boolean}[]).map(server=>({...server,cwd:process.cwd(),reuseExistingServer:true}))
};

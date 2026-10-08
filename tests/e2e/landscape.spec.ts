import {test,expect} from '@playwright/test';

test('landscape phone keeps start actions and compact HUD in view; optional panels never stack',async({browser})=>{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:5174');
  for(const viewport of [{width:844,height:390},{width:740,height:360},{width:667,height:375},{width:640,height:320}]){
   await page.setViewportSize(viewport);
   for(const id of ['#nickname','#mode-slide','#quick','#practice','#create','#room-code','#join']){
    const b=(await page.locator(id).boundingBox())!;expect(b.x,id).toBeGreaterThanOrEqual(0);expect(b.y,id).toBeGreaterThanOrEqual(0);expect(b.x+b.width,id).toBeLessThanOrEqual(viewport.width);expect(b.y+b.height,id).toBeLessThanOrEqual(viewport.height);
   }
   expect(await page.locator('#menu').evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({width:844,height:390});await page.screenshot({path:'.local/classic-landscape-menu.png'});
  await page.getByTestId('practice').click();await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#leaderboard')).toBeHidden();await expect(page.locator('#minimap')).toBeHidden();await expect(page.locator('#rotate-hint')).toBeHidden();
  for(const viewport of [{width:844,height:390},{width:667,height:375},{width:640,height:320}]){
   await page.setViewportSize(viewport);
   const boxes=[];
   for(const id of ['.score-block','#game-tools-toggle','#settings','#leave']){
    const b=(await page.locator(id).boundingBox())!;expect(b.x,id).toBeGreaterThanOrEqual(0);expect(b.y,id).toBeGreaterThanOrEqual(0);expect(b.x+b.width,id).toBeLessThanOrEqual(viewport.width);expect(b.y+b.height,id).toBeLessThanOrEqual(viewport.height);boxes.push(b);
   }
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);
   }
  }
  await page.setViewportSize({width:844,height:390});await page.screenshot({path:'.local/landscape-game.png'});
  await page.locator('#game-tools-toggle').click();await page.locator('#ranking-toggle').click();await expect(page.locator('#leaderboard')).toBeVisible();await expect(page.locator('#game-tools')).toBeHidden();
  await expect(page.locator('#minimap')).toBeVisible();await expect(page.locator('#leaderboard')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('#minimap')).toBeHidden();
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#rotate-hint')).toBeVisible();
  await page.setViewportSize({width:844,height:390});await expect(page.locator('#rotate-hint')).toBeHidden();
  // An unsupported fullscreen/orientation API must leave the game usable.
  await page.evaluate(()=>Object.defineProperty(document.querySelector('#app'),'requestFullscreen',{value:()=>Promise.reject(new Error('unsupported'))}));
  await page.locator('#game-tools-toggle').click();await page.locator('#fullscreen-toggle').click();await expect(page.locator('#notice')).toContainText('가로로');await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#notice-close').click();await page.locator('#game-tools-toggle').click();await page.locator('#leave-request').click();await page.getByTestId('leave').click();await page.getByTestId('practice').click();await expect(page.locator('#minimap')).toBeHidden();await expect(page.locator('#leaderboard')).toBeHidden();
 }finally{await context.close();}
});

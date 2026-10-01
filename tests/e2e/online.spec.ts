import {test,expect} from '@playwright/test';
test('T26 two independent browsers create, join and play one real friend match',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();
 for(const c of [a,b])await c.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));
 try{
  const pa=await a.newPage(),pb=await b.newPage();await pa.goto('/');await pa.getByTestId('nickname').fill('A');await pa.getByTestId('create').click();
  await expect(pa.locator('#room-panel')).toBeVisible();const code=await pa.locator('#friend-code').textContent();
  await pb.goto('/?room='+code);await pb.getByTestId('nickname').fill('B');await pb.getByTestId('join').click();
  await expect(pa.locator('#members')).toContainText('B');await expect(pb.locator('#start')).toBeHidden();await pa.getByTestId('start').click();
  await expect(pa.locator('#hud')).toBeVisible({timeout:10000});await expect(pb.locator('#hud')).toBeVisible();
  expect(await pa.locator('#hud').getAttribute('data-match-id')).toBe(await pb.locator('#hud').getAttribute('data-match-id'));
  expect(await pa.locator('#hud').getAttribute('data-self-id')).not.toBe(await pb.locator('#hud').getAttribute('data-self-id'));
  expect(await pa.evaluate(()=>sessionStorage.getItem('hexhold.session'))).not.toBe(await pb.evaluate(()=>sessionStorage.getItem('hexhold.session')));
  await pa.keyboard.down('d');await pb.keyboard.down('a');await pa.waitForTimeout(400);await pa.keyboard.up('d');await pb.keyboard.up('a');
  await expect(pa.locator('#population')).toContainText('2 HUMAN · 6 BOT');
  await pa.screenshot({path:'evidence/T26-online.png'});
  await pa.getByTestId('leave').click();await expect(pa.locator('#menu')).toBeVisible();await expect(pb.locator('#hud')).toBeVisible();
 }finally{await a.close();await b.close();}
});
test('T26 public admission and invalid friend code show actual server outcomes',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('hexhold.tutorialSeen','1'));await page.goto('/');
 await page.getByTestId('room-code').fill('00000000');await page.getByTestId('join').click();await expect(page.locator('#notice')).toContainText('존재하지 않는');
 await page.getByTestId('quick').click();await expect(page.locator('#hud')).toBeVisible({timeout:10000});await expect(page.locator('#population')).toContainText('1 HUMAN · 7 BOT');
});

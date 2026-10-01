import {test,expect} from '@playwright/test';
test('T19 nickname validation, skippable tutorial, safe DOM and game HUD',async({page})=>{
 await page.goto('/');await page.getByTestId('nickname').fill('😀'.repeat(17));await page.getByTestId('practice').click();
 await expect(page.locator('#notice')).toContainText('1–16');await expect(page.locator('#menu')).toBeVisible();
 await page.getByTestId('nickname').fill('<b>브로</b>');await page.getByTestId('practice').click();await expect(page.locator('#tutorial')).toBeVisible();
 await page.getByTestId('tutorial-skip').click();await expect(page.locator('#hud')).toBeVisible();
 await expect(page.locator('#population')).toContainText('1 HUMAN · 7 BOT');await expect(page.locator('#ranking')).toContainText('<b>브로</b>');
 expect(await page.locator('#ranking b').count()).toBe(8);
 await page.getByTestId('leave').click();await page.locator('#rules').click();await expect(page.locator('#tutorial')).toBeVisible();await page.getByTestId('tutorial-skip').click();await expect(page.locator('#menu')).toBeVisible();
 await page.screenshot({path:'evidence/T19-menu.png'});
});

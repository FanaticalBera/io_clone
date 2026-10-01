import {test,expect} from '@playwright/test';
test('T18 loaded client runs practice offline and cleans up repeated menu transitions',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#field')).toHaveAttribute('data-avatars','8');await context.setOffline(true);
 await page.getByTestId('practice').click();if(await page.locator('#tutorial').isVisible())await page.getByTestId('tutorial-skip').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#timer')).toHaveText('100%');
 await page.keyboard.press('d');await page.waitForTimeout(1800);await expect(page.locator('#timer-label')).toHaveText('CLASSIC');await expect(page.locator('#score')).toContainText('%');
 await page.screenshot({path:'evidence/T18-practice.png'});
 for(let i=0;i<3;i++){await page.getByTestId('leave').click();await expect(page.locator('#menu')).toBeVisible();await page.getByTestId('practice').click();if(await page.locator('#tutorial').isVisible())await page.getByTestId('tutorial-skip').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#field')).toHaveAttribute('data-avatars','8');}
 expect(errors).toEqual([]);
});


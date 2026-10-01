import {test,expect} from '@playwright/test';
test('built renderer reuses chunks and participants without script errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('.brand')).toContainText('HEXHOLD');
 await expect(page.locator('#field canvas')).toBeVisible();
 await expect(page.locator('#field')).toHaveAttribute('data-avatars','8');
 expect(Number(await page.locator('#field').getAttribute('data-chunks'))).toBeLessThanOrEqual(9);
 await page.screenshot({path:'evidence/T16-renderer.png'});
 expect(errors).toEqual([]);
});

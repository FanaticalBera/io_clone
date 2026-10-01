import {test,expect} from '@playwright/test';

test('live ranking updates a territory tiebreak even when total scores and row order stay unchanged',async({page})=>{
 await page.goto('http://127.0.0.1:5173/tests/fixtures/ui.html');
 const ranks=page.locator('#ranking .rank-number');
 await expect(ranks).toHaveText(['1','1']);
 await expect(page.locator('#ranking li.self .rank-name')).toHaveText('A');
 // A loses one territory cell and earns one point. Both totals remain 20,
 // but B now wins the territory tiebreak without changing the row order.
 await page.evaluate(()=>{
  const {ui,view}=(window as any).fixture;
  view.participants[1].territoryCount=19;view.participants[1].controlScore=1;view.tick++;
  ui.updateView(view,'A');
 });
 await expect(ranks).toHaveText(['1','2']);
 await expect(page.locator('#ranking .rank-percent')).toHaveText(['1.3%','1.2%']);await expect(page.locator('#ranking .rank-kills')).toHaveText(['처치 0','처치 0']);
 // Reusing the same score snapshot must still highlight the current player.
 await page.evaluate(()=>{const {ui,view}=(window as any).fixture;ui.updateView(view,'B');});
 await expect(page.locator('#ranking li.self .rank-name')).toHaveText('B');
});

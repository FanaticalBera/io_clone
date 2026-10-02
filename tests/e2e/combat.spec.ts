import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test('reported disconnected territory, confirmed kill feedback and wall death render through wire snapshots',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5173/tests/fixtures/combat.html');
 await page.waitForFunction(()=>(window as any).fixture?.scene.combatState()!==null);
 await page.evaluate(()=>(window as any).fixture.split());
 const split=await page.evaluate(()=>{const {m,id}=(window as any).fixture;return {detached:m.owners[id(1,0)],opponent:m.participants[1].territoryCount,displayed:Array.from(document.querySelectorAll('#ranking .rank-percent')).map(n=>n.textContent)};});
 expect(split).toEqual({detached:0,opponent:3,displayed:['0.1%','0.1%']});
 await page.screenshot({path:'evidence/reported-territory-split.png'});
 await page.evaluate(()=>(window as any).fixture.kill());
 await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.combatState().kills)).toBe(1);
 const kill=await page.evaluate(()=>(window as any).fixture.scene.combatState());
 expect(kill).toMatchObject({played:1,kills:1,deaths:0,feedback:'KILL'});
 // Freeze the actual first rendered impact frame only for the screenshot, then resume.
 await page.evaluate(()=>(window as any).fixture.freezeImpact());
 await page.screenshot({path:'evidence/reported-kill-impact.png'});
 await page.evaluate(()=>(window as any).fixture.resume());
 await page.evaluate(()=>{const {show}=(window as any).fixture;for(let i=0;i<5;i++)show();});
 expect(await page.evaluate(()=>(window as any).fixture.scene.combatState().played)).toBe(1);
 await page.evaluate(()=>(window as any).fixture.wall());
 await expect(page.getByTestId('death')).toContainText('벽에 부딪쳤어요.');
 await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.combatState().deaths)).toBe(1);
 const death=await page.evaluate(()=>(window as any).fixture.scene.combatState());
 expect(death).toMatchObject({played:2,kills:1,deaths:1,feedback:'DEATH'});
 expect(await page.evaluate(()=>(window as any).fixture.m.participants[0].territoryCount)).toBe(0);
 await page.evaluate(()=>(window as any).fixture.freezeImpact());
 await page.screenshot({path:'evidence/reported-wall-impact.png'});
 await page.evaluate(()=>(window as any).fixture.resume());
 await page.waitForTimeout(1000);
 expect(await page.evaluate(()=>(window as any).fixture.scene.combatState())).toMatchObject({active:0,feedback:null});
 await page.evaluate(()=>(window as any).fixture.show(true));
 expect(await page.evaluate(()=>(window as any).fixture.scene.combatState().played)).toBe(0);
 expect(errors).toEqual([]);
 await writeFile('evidence/reported-combat.json',JSON.stringify({condition:'Controlled browser fixture using actual shared engine and wire snapshot roundtrip; full live two-browser gameplay is covered by multiplayer.spec.ts',split,kill,death,pageErrors:errors},null,2));
});

test('mutual confirmed cuts show both statistics and prioritize my death feedback',async({page})=>{
 await page.goto('http://127.0.0.1:5173/tests/fixtures/combat.html');
 await page.waitForFunction(()=>(window as any).fixture?.scene.combatState()!==null);
 await page.evaluate(()=>(window as any).fixture.mutual());
 await expect(page.getByTestId('death')).toContainText('상대가 선을 밟았어요.');
 expect(await page.evaluate(()=>(window as any).fixture.scene.combatState())).toMatchObject({played:2,kills:1,deaths:1,feedback:'DEATH'});
 await page.evaluate(()=>(window as any).fixture.freezeImpact());
 await page.screenshot({path:'evidence/death-cause-contact.png'});
 await page.evaluate(()=>(window as any).fixture.resume());
});

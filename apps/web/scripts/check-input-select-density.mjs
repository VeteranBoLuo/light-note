import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const snapshot=page=>page.locator('.input-container,.b-input,.b-textarea,.prefix-icon,.suffix-icon,.input-clear-btn,.select-trigger,.select-tag,.select-suffix,.select-loading,.select-dropdown:visible,.select-no-data').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {rect:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100),font:s.fontSize,padding:s.padding,maxHeight:s.maxHeight};}));
try{
 for(const width of [1440,1024,390])for(const theme of ['day','night'])for(const state of ['single','multiple','tag','empty','loading','disabled']){
  let baseline;
  for(const port of [5174,5173]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://localhost:${port}/e2e/input-select-density.html?state=${state}&theme=${theme}`);await page.locator('.b-input').waitFor();
   await page.addStyleTag({content:'.select-loading{animation:none!important}'});
   if(state!=='disabled'){await page.locator('.select-trigger').click();await page.locator('.select-dropdown:visible').waitFor();}await page.waitForTimeout(150);
   if(port===5174)baseline=await snapshot(page);
   else for(const density of ['medium','small','large']){
    await page.evaluate(d=>window.setDensity(d),density);await page.waitForTimeout(150);
    const actual=await snapshot(page);if(width<1200||density==='medium')assert.deepEqual(actual,baseline);else assert.notDeepEqual(actual,baseline);
    if(state!=='disabled'){
     const r=await page.locator('.select-dropdown:visible').boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=900);
     if(state==='single'){
      await page.locator('.select-option').filter({hasText:/Option 5$/}).click();assert.equal((await page.evaluate(()=>window.values())).selection,'5');
      await page.locator('.select-trigger').click();
     }else if(state==='multiple'||state==='tag'){
      await page.locator('.select-option').filter({hasText:/Option 5$/}).click();assert.ok((await page.evaluate(()=>window.values())).selection.includes('5'));await page.locator('.select-option').filter({hasText:/Option 5$/}).click();
     }
    }else assert.equal(await page.locator('.b-input').isDisabled(),true);
    await page.screenshot({path:`/tmp/input-select-${width}-${theme}-${state}-${density}.png`});
    if(state!=='disabled'){
     await page.locator('.b-input').fill('Changed');await page.locator('.input-clear-btn').click();assert.equal((await page.evaluate(()=>window.values())).text,'');
     await page.evaluate(()=>window.resetValue());await page.locator('.select-trigger').click();await page.locator('.select-dropdown:visible').waitFor();
    }
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log(`passed ${width}/${theme}/${state}`);
 }
}finally{await browser.close();}

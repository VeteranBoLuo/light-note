// Warm component mounting/interaction benchmark, not network or whole-app navigation timing.
// Uses identical current components in both arms. Only density var() references
// are replaced with their standard px fallbacks in the fixed arm.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const samples={variables:{tables:[],cards:[],menu:[]},fixed:{tables:[],cards:[],menu:[]}};
const token=/var\(\s*--ui-(?:space|control|layout|font|card)-[\d_]+\s*,\s*(\d+(?:\.\d+)?px)\s*\)/g;
const geometries=new Map();
const verifyOnly=process.env.VERIFY_ONLY==='1';
let substitutions=0, nodes;
try{
 for(let block=0;block<(verifyOnly?1:4);block++)for(const mode of block%2?['fixed','variables']:['variables','fixed']){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Both arms use the same fetch path; substitutions occur only before loading,
  // outside every timed interval. No production file or API is changed.
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/'))throw new Error(`Unexpected API in isolated fixture: ${url.pathname}`);
   if(url.origin==='http://localhost:5173'&&url.pathname.startsWith('/src/')){
    const response=await route.fetch();let body=await response.text();
    if(mode==='fixed')body=body.replace(token,(_match,px)=>{substitutions++;return px;});
    return route.fulfill({response,body});
   }
   return route.continue();
  });
  await page.goto('http://localhost:5173/e2e/density-performance.html');
  await page.locator('.table-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  if(mode==='fixed')await page.evaluate(()=>{for(const name of Array.from(document.documentElement.style))if(name.startsWith('--ui-'))document.documentElement.style.removeProperty(name);});
  for(const view of ['tables','cards']) {
   await page.evaluate(v=>window.benchNavigate(v),view);
   const snap=await page.locator('main *').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return [r.width,r.height,s.fontSize,s.padding];}));
   if(!geometries.has(view))geometries.set(view,snap);else assert.deepEqual(snap,geometries.get(view),`Identical ${view} standard geometry required`);
  }
  await page.evaluate(()=>window.benchNavigate('tables'));
  nodes=await page.locator('main *').count();
  await page.evaluate(()=>window.benchMenu());await page.waitForTimeout(100);
  const menu=await page.locator('.select-dropdown:visible').evaluate(root=>[root,...root.querySelectorAll('*')].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return [r.width,r.height,s.fontSize,s.padding];}));
  if(!geometries.has('menu'))geometries.set('menu',menu);else assert.deepEqual(menu,geometries.get('menu'),'Identical menu geometry required');
  await page.evaluate(()=>window.benchMenu());
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  for(let i=0;i<(verifyOnly?0:25);i++){
   for(const view of ['cards','tables']){
    const elapsed=await page.evaluate(v=>window.benchNavigate(v),view);
    if(i>=5)samples[mode][view].push(elapsed);
   }
   const elapsed=await page.evaluate(()=>window.benchMenu());
   await page.evaluate(()=>window.benchMenu());
   if(i>=5)samples[mode].menu.push(elapsed);
  }
  assert.deepEqual(errors,[]);await context.close();console.log(`completed block ${block+1} ${mode}`);
 }
 if(verifyOnly){console.log('All three scenarios have identical geometry.');}
 else {
 const summary={};
 for(const mode of ['variables','fixed']){
  summary[mode]={};for(const [name,values] of Object.entries(samples[mode])){
   const sorted=values.toSorted((a,b)=>a-b);summary[mode][name]={samples:values.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]};
  }
 }
 const result={scope:'Warm Vue remount + forced layout; menu open + forced layout. Excludes network, cold start and paint. Current Chrome headless, 4x CPU throttle, 1440x900.',nodes,substitutions,summary,samples};
 await writeFile('/tmp/density-performance-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({nodes,substitutions,summary},null,2));
 }
}finally{await browser.close();}

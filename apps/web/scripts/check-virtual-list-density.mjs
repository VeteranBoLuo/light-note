import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const snapshot = page => page.locator('.b-virtual-list__item:nth-child(-n+5),.b-virtual-list__placeholder,.b-virtual-list__loading').evaluateAll(els => els.map(el => {
  const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
  return { rect: [rect.x, rect.y, rect.width, rect.height].map(n => Math.round(n * 100) / 100), padding: style.padding, margin: style.margin, minHeight: style.minHeight };
}));
const firstVisible = page => page.locator('main').evaluate(main => {
  const top = main.getBoundingClientRect().top;
  return [...main.querySelectorAll('[data-virtual-index]')].find(row => row.getBoundingClientRect().bottom > top + 1)?.getAttribute('data-virtual-index');
});
try {
  for (const width of [1440, 1024, 390]) for (const theme of ['day', 'night']) for (const state of ['ready', 'loading', 'placeholder', 'ancestor']) {
    let baseline;
    for (const port of [5174, 5173]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://localhost:${port}/e2e/virtual-list-density.html?state=${state}&theme=${theme}`);
      await page.locator('.b-virtual-list__item').first().waitFor();
      await page.waitForTimeout(120);
      if (port === 5174) baseline = await snapshot(page);
      else for (const density of ['medium', 'small', 'large']) {
        await page.evaluate(d => window.setDensity(d), density);
        await page.evaluate(() => window.scrollToRow(0));
        await page.waitForTimeout(150);
        const actual = await snapshot(page);
        if (width < 1200 || density === 'medium') assert.deepEqual(actual, baseline);
        else assert.notDeepEqual(actual, baseline);
        if (state !== 'placeholder') {
          await page.evaluate(() => window.scrollToRow(50));
          await page.waitForTimeout(100);
          assert.equal(await firstVisible(page), '50');
          await page.evaluate(() => window.setDensity('small'));
          await page.waitForTimeout(150);
          assert.equal(await firstVisible(page), '50');
          await page.evaluate(d => window.setDensity(d), density);
          await page.waitForTimeout(150);
          assert.equal(await firstVisible(page), '50');
          await page.evaluate(() => window.scrollToRow(99));
          await page.waitForTimeout(100);
        }
        assert.equal(await page.locator('.b-virtual-list__loading').count(), ['loading', 'ancestor'].includes(state) ? 1 : 0);
        if (state === 'loading' || state === 'ancestor') {
          await page.locator(state === 'ancestor' ? 'main' : '.b-virtual-list').evaluate(el => { el.scrollTop = el.scrollHeight; });
          const box = await page.locator('.b-virtual-list__loading').boundingBox();
          assert.ok(box.y >= 0 && box.y + box.height <= 800);
        }
        await page.screenshot({ path: `/tmp/virtual-list-${width}-${theme}-${state}-${density}.png` });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`passed ${width}/${theme}/${state}`);
  }
} finally { await browser.close(); }

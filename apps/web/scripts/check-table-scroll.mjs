import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.LIGHTNOTE_VISUAL_OUTPUT || '/tmp/lightnote-table-scroll';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
async function verifyAlignment(page) {
  const result = await page.evaluate(() => {
    const header = document.querySelector('.table-header-viewport');
    const body = document.querySelector('.table-body');
    const headings = [...document.querySelectorAll('.header-cell')].map((el) => el.getBoundingClientRect());
    const cells = [...document.querySelectorAll('.table-row:first-child .table-cell')].map((el) =>
      el.getBoundingClientRect(),
    );
    return {
      left: [header.scrollLeft, body.scrollLeft],
      range: [header.scrollWidth - header.clientWidth, body.scrollWidth - body.clientWidth],
      offsets: cells.map((rect, index) => [rect.left - headings[index].left, rect.width - headings[index].width]),
      lastRight: cells.at(-1)?.right,
      bodyRight: body.getBoundingClientRect().left + body.clientWidth,
      outerOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.ok(Math.abs(result.left[0] - result.left[1]) < 1, JSON.stringify(result));
  assert.ok(Math.abs(result.range[0] - result.range[1]) <= 1, JSON.stringify(result));
  assert.ok(
    result.offsets.flat().every((delta) => Math.abs(delta) < 1),
    JSON.stringify(result),
  );
  assert.ok(result.outerOverflow <= 1, JSON.stringify(result));
  return result;
}
try {
  for (const width of [1440, 900])
    for (const theme of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width, height: 800 } }),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      await page.goto(`${origin}/e2e/table-scroll.html?theme=${theme}`);
      await page.locator('.table-row').first().waitFor();
      for (const mode of ['wide', 'virtual', 'mixed', 'narrow']) {
        await page.evaluate((mode) => window.tableFixture.set(mode), mode);
        for (const density of ['medium', 'small', 'large']) {
          await page.evaluate((density) => window.tableFixture.density(density), density);
          await page.waitForTimeout(150);
          await verifyAlignment(page);
          await page.locator('.table-body').evaluate((body) => {
            body.scrollLeft = body.scrollWidth;
          });
          await page.waitForTimeout(100);
          const right = await verifyAlignment(page);
          assert.ok(right.lastRight <= right.bodyRight + 1, JSON.stringify(right));
          await page.locator('.table-header-viewport').evaluate((header) => {
            header.scrollLeft = 100;
          });
          await page.waitForTimeout(100);
          await verifyAlignment(page);
          if (mode === 'virtual') {
            await page.locator('.table-body').evaluate((body) => {
              body.scrollTop = 4800;
            });
            await page.waitForTimeout(100);
            await verifyAlignment(page);
            assert.ok((await page.locator('.table-row').count()) < 1000);
          }
        }
        if (mode === 'wide') {
          await page.screenshot({ path: `${output}/${width}-${theme}.png` });
          // Resizing with an active horizontal offset must preserve matching tracks.
          await page.setViewportSize({ width: width - 100, height: 800 });
          await page.waitForTimeout(150);
          await verifyAlignment(page);
          await page.setViewportSize({ width, height: 800 });
        }
      }
      await page.evaluate(() => window.tableFixture.set('wide', true));
      await page.waitForTimeout(100);
      await page.evaluate(() => window.tableFixture.set('wide'));
      await page.waitForTimeout(100);
      await verifyAlignment(page);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`passed ${width}/${theme}: fixed, flexible, virtual, resize and empty-to-loaded`);
    }
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Run against the local Vite server. The fixture generates its workbook without API requests.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
try {
  for (const mobile of [false, true]) {
    let baseline;
    for (const theme of ['day', 'night']) {
      for (const density of ['medium', 'small', 'large']) {
        const page = await browser.newPage({
          viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 900 },
        });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
        await page.goto(
          `${origin}/e2e/excel-zoom.html?density=${density}&theme=${theme}${mobile ? '&renderProfile=mobile' : ''}`,
        );
        await page.waitForSelector('body[data-ready=true]', { state: 'attached' });
        const grid = page.locator('.x-spreadsheet-overlayer');
        const point = async (x, y, scale = 1) => {
          const box = await grid.boundingBox();
          return { x: box.x + x * scale, y: box.y + y * scale };
        };
        const read = async (key) => JSON.parse(await page.locator('body').getAttribute(`data-${key}`));
        const click = async (x, y, scale) => {
          const p = await point(x, y, scale);
          await page.mouse.click(p.x, p.y);
          const selected = await read('selected');
          return [selected.rowIndex, selected.columnIndex];
        };
        const x = mobile ? 260 : 740;
        const selected = await click(x, 250);
        const start = await point(150, 100);
        const end = await point(x, 250);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        const { startRowIndex, startColumnIndex, endRowIndex, endColumnIndex } = await read('range');
        const range = [startRowIndex, startColumnIndex, endRowIndex, endColumnIndex];
        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(300);
        const scrolled = await click(x, 250);
        assert.ok(scrolled[0] > selected[0], 'Wheel must actually scroll the sheet');
        await page
          .locator('.x-spreadsheet-bottombar li')
          .filter({ hasText: /^第二张表$/ })
          .click();
        await page.waitForTimeout(250);
        const switched = await click(x, 250);
        await page.reload();
        await page.waitForSelector('body[data-ready=true]', { state: 'attached' });
        // Existing previews must use the current preference without remounting.
        await page.evaluate(() => {
          window.setDensity('large');
          window.dispatchEvent(new Event('resize'));
        });
        await page.waitForTimeout(250);
        const changed = await click(x, 250);
        const result = { selected, range, scrolled, switched, changed };
        if (!baseline) baseline = result;
        else assert.deepEqual(result, baseline, `${mobile ? 'mobile' : 'desktop'} ${theme} ${density}`);
        assert.deepEqual(errors, []);
        if (process.env.LIGHTNOTE_SCREENSHOT_DIR) {
          await page.screenshot({
            path: `${process.env.LIGHTNOTE_SCREENSHOT_DIR}/${mobile ? 'mobile' : 'desktop'}-${theme}-${density}.png`,
          });
        }
        console.log(`PASS ${mobile ? 'mobile' : 'desktop'} ${theme} ${density}: ${JSON.stringify(result)}`);
        await page.close();
      }
    }
  }
  // Verify the shared production preview wrapper, including both themes and mobile rendering.
  for (const mobile of [false, true]) {
    for (const theme of ['day', 'night']) {
      const page = await browser.newPage({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 900 },
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
      await page.goto(
        `${origin}/e2e/excel-zoom.html?density=small&fullPreview=1&theme=${theme}${mobile ? '&renderProfile=mobile' : ''}`,
      );
      await page.waitForSelector('.x-spreadsheet-bottombar li.active');
      await page.waitForTimeout(300);
      for (const density of ['medium', 'small', 'large']) {
        await page.evaluate((d) => window.setDensity(d), density);
        await page.waitForTimeout(300);
        const checkClick = async () => {
          const grid = await page.locator('.x-spreadsheet-overlayer').boundingBox();
          const x = grid.x + (mobile ? 260 : 740),
            y = grid.y + 250;
          await page.mouse.click(x, y);
          const boxes = await page
            .locator('.x-spreadsheet-selector-area')
            .filter({ visible: true })
            .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
          assert.ok(
            boxes.some((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom),
            `Selection contains click: ${mobile ? 'mobile' : 'desktop'}/${theme}/${density}`,
          );
        };
        await checkClick();
        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(300);
        await checkClick();
        await page
          .locator('.x-spreadsheet-bottombar li')
          .filter({ hasText: /^第二张表$/ })
          .click();
        await page.waitForTimeout(250);
        await checkClick();
        await page
          .locator('.x-spreadsheet-bottombar li')
          .filter({ hasText: /^坐标验收$/ })
          .click();
        await page.waitForTimeout(250);
        assert.deepEqual(errors, []);
        if (process.env.LIGHTNOTE_SCREENSHOT_DIR)
          await page.screenshot({
            path: `${process.env.LIGHTNOTE_SCREENSHOT_DIR}/full-${mobile ? 'mobile' : 'desktop'}-${theme}-${density}.png`,
          });
        console.log(`PASS shared FilePreview ${mobile ? 'mobile' : 'desktop'} ${theme} ${density}`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}

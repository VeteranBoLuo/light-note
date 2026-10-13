import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const screenshotDir = process.env.LIGHTNOTE_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const cases = [
  {
    id: 'txt-wrong-mime',
    input: { csv: '1', fileName: '说明.txt', fileType: 'application/msword', category: 'word' },
    selector: '.preview-text',
    label: '文本',
  },
  {
    id: 'unknown-extension',
    input: { csv: '1', fileName: '未知.bin', fileType: 'text/html', category: 'text' },
    selector: '.unsupported-preview',
    label: '文本',
  },
  {
    id: 'extensionless-csv',
    input: { csv: '1', fileName: '数据', fileType: 'text/csv', category: 'image' },
    selector: '.csv-cell',
    label: 'CSV',
  },
  {
    id: 'xlsx-wrong-category',
    input: { fileName: '工作簿.xlsx', fileType: 'text/plain', category: 'text' },
    selector: '.x-spreadsheet-bottombar li.active',
    label: 'Excel',
  },
];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const mobile of [false, true])
    for (const theme of ['day', 'night'])
      for (const test of cases) {
        const page = await browser.newPage({
          viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 900 },
        });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
        await page.addInitScript(() => {
          window.blobReads = 0;
          const fetch = window.fetch;
          window.fetch = (...args) => {
            if (String(args[0]).startsWith('blob:')) window.blobReads++;
            return fetch(...args);
          };
        });
        const query = new URLSearchParams({
          fullPreview: '1',
          theme,
          ...test.input,
          ...(mobile ? { renderProfile: 'mobile' } : {}),
        });
        await page.goto(`${origin}/e2e/excel-zoom.html?${query}`);
        await page.waitForSelector(test.selector);
        await page.waitForSelector('.preview-loading', { state: 'detached' });
        assert.equal(await page.locator('.file-type-badge').innerText(), test.label);
        if (test.id === 'txt-wrong-mime')
          assert.match(await page.locator('.preview-text').innerText(), /来源资料,价格/);
        if (test.id === 'unknown-extension') {
          assert.equal(await page.locator('iframe').count(), 0);
          assert.equal(await page.evaluate(() => window.blobReads), 0);
        }
        assert.deepEqual(errors, []);
        if (screenshotDir)
          await page.screenshot({
            path: `${screenshotDir}/${test.id}-${mobile ? 'mobile' : 'desktop'}-${theme}.png`,
          });
        console.log(`PASS ${test.id} ${mobile ? 'mobile' : 'desktop'} ${theme}`);
        await page.close();
      }
} finally {
  await browser.close();
}

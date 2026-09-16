import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const output = process.env.LIGHTNOTE_SCREENSHOT_DIR;
if (output) await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of [1440, 390])
    for (const theme of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      let originalRequests = 0;
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/original-must-not-be-requested.png', (route) => {
        originalRequests++;
        return route.fulfill({ status: 404, body: '' });
      });
      const url = `${origin}/e2e/image-previews.html?video=true&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`;
      await page.goto(url);
      const cards = page.locator('.file-card-video-preview');
      await cards.first().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.file-card-video-preview img')?.complete);
      assert.equal(await cards.count(), 6);
      assert.equal(await cards.locator('video').count(), 0);
      assert.equal(await cards.first().locator('.file-card-video-duration').textContent(), '0:13');
      await cards.nth(4).scrollIntoViewIfNeeded();
      await cards.nth(4).getByRole('button', { name: '查看原因' }).click();
      await page.getByRole('button', { name: '重试预览', exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll('.file-card-video-preview')[4].querySelector('img')?.complete,
      );
      assert.equal(originalRequests, 0);
      await page.evaluate(() => window.__toggleVideoDirectory());
      assert.equal(await cards.count(), 0);
      await page.evaluate(() => window.__toggleVideoDirectory());
      await cards.first().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.file-card-video-preview img')?.complete);
      assert.equal(originalRequests, 0);
      await page.reload();
      await cards.first().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.file-card-video-preview img')?.complete);
      assert.equal(originalRequests, 0);
      if (output) await page.screenshot({ path: `${output}/video-covers-${width}-${theme}.png`, fullPage: true });
      const originalResponse = page.waitForResponse((response) =>
        response.url().includes('original-must-not-be-requested'),
      );
      await page.locator('.file-card').first().click();
      await page.waitForFunction(() => document.querySelector('.fullscreen-preview video'));
      await originalResponse;
      assert.ok(originalRequests > 0);
      assert.deepEqual(errors, []);
      console.log(`${width} ${theme}: cover/status/retry/directory/reload passed; source requested only on playback`);
      await page.close();
    }
} finally {
  await browser.close();
}

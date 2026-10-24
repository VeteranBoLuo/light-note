import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const output = '/tmp/lightnote-heic-browser';
const english = process.env.LIGHTNOTE_PREVIEW_LANG === 'en';
const mobileOnly = process.env.LIGHTNOTE_HEIC_MOBILE_ONLY === '1';
const original = await readFile(new URL('../../server/util/imagePreview/fixtures/primary.heic', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const mobile of (mobileOnly ? [true] : [false, true]))
    for (const theme of ['day', 'night'])
      for (const density of mobile ? ['medium'] : english ? ['small'] : ['small', 'medium', 'large']) {
        const page = await browser.newPage({
          viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        });
        const errors = [];
        let originals = 0;
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
        page.context().on('request', (request) => { if (request.resourceType() !== 'script' && request.url().includes('/fixtures/primary.heic')) originals++; });
        const query = new URLSearchParams({
          heic: '1',
          lang: english ? 'en' : 'zh',
          theme,
          density,
          ...(mobile ? { renderProfile: 'mobile' } : {}),
        });
        await page.goto(`${origin}/e2e/image-previews.html?${query}`);
        const card = (i) => page.locator(`[data-cloud-file-id="cloud-${i}"]`);
        await card(0).scrollIntoViewIfNeeded();
        await card(0).locator('.managed-image-preview img').waitFor();
        assert.equal(originals, 0);
        await card(0).locator('.file-card-headline').click();
        await page.getByText(english ? 'Preparing image preview' : '正在生成图片预览', { exact: true }).waitFor();
        await page.locator('.preview-image').waitFor();
        await page.locator('.preview-loading').waitFor({ state: 'detached' });
        assert.match(await page.locator('.preview-image').getAttribute('src'), /^data:image\/webp;/);
        assert.ok(await page.locator('.preview-image').evaluate((img) => img.naturalWidth > 0));
        assert.equal(originals, 0, 'Viewing a derivative must not load HEIC into the browser');
        const name = `${english ? 'en-' : ''}${mobile ? 'mobile' : 'desktop'}-${theme}-${density}`;
        await page.screenshot({ path: `${output}/${name}-display.png` });
        const downloaded = page.waitForEvent('download');
        await page.locator('.preview-controls .preview-control-group button').first().click();
        const download = await downloaded;
        assert.equal(download.suggestedFilename(), 'HEIC-0.heic');
        assert.deepEqual(await readFile(await download.path()), original);
        assert.match(download.url(), /primary\.heic/);
        await page.keyboard.press('Escape');
        await page.locator('.fullscreen-preview').waitFor({ state: 'detached' });
        await card(2).locator('.file-card-headline').click();
        await page
          .locator('.preview-error')
          .getByText(english ? /could not be decoded/ : /无法解码/)
          .waitFor();
        assert.equal(await page.locator('.retry-btn').count(), 0);
        await page.screenshot({ path: `${output}/${name}-decode-error.png` });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        console.log(`PASS HEIC display, original download, decode failure ${name}`);
        await page.close();
      }
} finally {
  await browser.close();
}

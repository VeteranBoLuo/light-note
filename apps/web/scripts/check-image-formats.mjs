import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const output = process.env.LIGHTNOTE_SCREENSHOT_DIR || '/tmp/lightnote-image-formats';
const english = process.env.LIGHTNOTE_PREVIEW_LANG === 'en';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const mobile of [false, true])
    for (const theme of ['day', 'night'])
      for (const density of mobile ? ['medium'] : english ? ['small'] : ['small', 'medium', 'large']) {
        const page = await browser.newPage({
          viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        });
        page.setDefaultTimeout(60000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
        await page.route('**/fixture-broken-*', (route) =>
          route.fulfill({ status: 404, body: 'fixture image missing', contentType: 'text/plain' }),
        );
        const query = new URLSearchParams({
          realFormats: '1',
          theme,
          density,
          lang: english ? 'en' : 'zh',
          ...(mobile ? { renderProfile: 'mobile' } : {}),
        });
        await page.goto(`${origin}/e2e/image-previews.html?${query}`);
        const card = (index) => page.locator(`[data-cloud-file-id="cloud-${index}"]`);
        await card(0).scrollIntoViewIfNeeded();
        await card(0).locator('.managed-image-preview img').waitFor();
        await card(2).scrollIntoViewIfNeeded();
        await card(2).getByText(english ? 'Thumbnail format not supported' : '此格式暂不支持缩略图', { exact: true }).waitFor();
        await card(2).getByRole('button', { name: english ? 'Why unavailable' : '原因说明', exact: true }).click();
        await page
          .locator('.b-popover-panel')
          .getByText(english ? /actual image format/ : /实际格式/)
          .waitFor({ timeout: 5000 });
        assert.equal(await card(2).locator('img').count(), 0, 'Reading the reason does not load the original');
        await card(2).getByRole('button', { name: english ? 'Why unavailable' : '原因说明', exact: true }).click();
        await card(4).scrollIntoViewIfNeeded();
        await card(4).getByText(english ? 'Thumbnail failed to load' : '缩略图加载失败', { exact: true }).waitFor();
        const name = `${english ? 'en-' : ''}${mobile ? 'mobile' : 'desktop'}-${theme}-${density}`;
        await page.screenshot({ path: `${output}/${name}-cards.png`, fullPage: true });
        await card(0).locator('.file-card-headline').click();
        await page.locator('.preview-image').waitFor();
        await page.locator('.preview-loading').waitFor({ state: 'detached' });
        assert.match(await page.locator('.preview-image').getAttribute('src'), /^data:image\/jpeg;/);
        assert.ok(await page.locator('.preview-image').evaluate((el) => el.naturalWidth > 0));
        await page.screenshot({ path: `${output}/${name}-original.png` });
        await page.keyboard.press('Escape');
        await page.locator('.fullscreen-preview').waitFor({ state: 'detached' });
        await card(2).locator('.file-card-headline').click();
        await page
          .locator('.unsupported-preview')
          .getByText(english ? /actual image format/ : /实际图片格式/)
          .waitFor();
        assert.equal(await page.locator('.preview-image').count(), 0);
        await page.screenshot({ path: `${output}/${name}-unsupported.png` });
        await page.keyboard.press('Escape');
        await page.locator('.fullscreen-preview').waitFor({ state: 'detached' });
        await card(4).locator('.file-card-headline').click();
        await page.locator('.preview-error').getByText(english ? /connection/ : /网络/).waitFor();
        assert.equal(await page.locator('.retry-btn').count(), 1);
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        console.log(`PASS image formats ${name}`);
        await page.close();
      }
} finally {
  await browser.close();
}

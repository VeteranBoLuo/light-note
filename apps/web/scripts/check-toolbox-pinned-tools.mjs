import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out = process.env.TOOLBOX_PINS_OUTPUT || '/tmp/lightnote-pins-browser';
const base = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://127.0.0.1:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local fixture server');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
});
const errors = [];
try {
  for (const [width, theme, density] of [
    [1440, 'day', 'standard'],
    [1440, 'night', 'compact'],
    [1440, 'day', 'comfortable'],
    [390, 'day', 'standard'],
    [390, 'night', 'standard'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(() =>
      localStorage.setItem('lightnote.toolbox.pinned-tools.v1:visual-user:user', JSON.stringify(['pdf_organizer'])),
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const url = `${base}/e2e/toolbox-workspace.html?view=home&tab=catalog&theme=${theme}&density=${density}${width < 768 ? '&renderProfile=mobile' : ''}`;
    await page.goto(url);
    const pins = page.locator('.toolbox-card__pin');
    await pins.first().waitFor({ timeout: 45000 });
    await page.waitForFunction(() => window.pinFixture?.requests.some((r) => r.input?.action === 'migrate'));
    await page.waitForFunction(() => !document.querySelector('.toolbox-card__pin')?.disabled);
    const original = page.locator('.toolbox-card__pin[aria-pressed="true"]');
    assert.equal(await original.count(), 1, 'legacy migration visible');
    await original.click();
    await page.waitForFunction(() => document.querySelectorAll('.toolbox-card__pin[aria-pressed="true"]').length === 0);
    await page.reload();
    await pins.first().waitFor();
    await page.waitForFunction(
      () => window.pinFixture?.requests.length > 0 && !document.querySelector('.toolbox-card__pin')?.disabled,
    );
    assert.equal(
      await page.locator('.toolbox-card__pin[aria-pressed="true"]').count(),
      0,
      'empty account remains empty despite old cache',
    );
    await pins.first().click();
    await page.waitForFunction(() => document.querySelectorAll('.toolbox-card__pin[aria-pressed="true"]').length === 1);
    await page.evaluate(() => {
      window.pinFixture.fail = true;
      window.pinFixture.delay = 300;
    });
    const before = await pins.first().boundingBox();
    await pins.first().click();
    await page.waitForFunction(() => document.querySelector('.toolbox-card__pin')?.disabled);
    assert.equal(await pins.first().getAttribute('aria-pressed'), 'true', 'pending write preserves confirmed state');
    const during = await pins.first().boundingBox();
    assert.equal(during.width, before.width, 'loading keeps button width');
    assert.equal(during.height, before.height, 'loading keeps button height');
    await page.getByText('置顶保存失败，请重试', { exact: true }).waitFor();
    assert.equal(await pins.first().getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: `${out}/${width}-${theme}-${density}.png`, fullPage: true });
    await page.evaluate(() => {
      window.pinFixture.fail = false;
      window.pinFixture.delay = 0;
    });
    await pins.first().click();
    await page.waitForFunction(() => document.querySelectorAll('.toolbox-card__pin[aria-pressed="true"]').length === 0);
    console.log(`PASS ${width} ${theme} ${density}: migration / clear / reload / save failure / retry`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/e2e/toolbox-workspace.html?view=home&tab=catalog&account=guest&renderProfile=mobile`);
  const pin = page.locator('.toolbox-card__pin').first();
  await pin.waitFor({ timeout: 45000 });
  await pin.click();
  assert.equal(await pin.getAttribute('aria-pressed'), 'true');
  await page.reload();
  await pin.waitFor();
  assert.equal(await pin.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(() => window.pinFixture.requests), []);
  console.log('PASS visitor: local persistence, no account requests');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

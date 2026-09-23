import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const integration = process.env.NOTE_DETAIL_INTEGRATION === '1';
const viewportWidth = Number(process.env.VIEWPORT_WIDTH || 1440);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 }, reducedMotion: 'reduce' });
  await page.route('**/api/note/resourceBacklinks', (route) =>
    route.fulfill({
      json: {
        status: 200,
        data: {
          available: true,
          items: [
            {
              sourceType: 'todo',
              id: 'sample-todo',
              title: '筒灯告改造',
              status: 'pending',
              updateTime: '2026-09-22 08:00:00',
            },
          ],
          hasMore: false,
          hasMoreByType: { note: false, todo: false },
        },
      },
    }),
  );
  const pageErrors = [];
  page.on('console', msg => { if (integration && msg.type() === 'error') console.error('console:', msg.text()); });
  page.on('pageerror', e => { pageErrors.push(e.message); console.error('pageerror:', e.message); });
  if (integration) await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/') || path === '/api/note/resourceBacklinks') return route.fallback();
    const data = path === '/api/note/getNoteDetail' ? { id: 'density-note', title: 'Density integration', type: 'html', content: '<h1>Density integration</h1><p>Editor body keeps its own dimensions.</p>', createBy: 'density-fixture', revision: 1, updateTime: '2026-09-22 08:00:00', breadcrumb: [], noteTreeFeatures: {} } : [];
    return route.fulfill({ json: { status: 200, data } });
  });
  for (const theme of ['day', 'night']) {
    await page.goto(`http://localhost:5173/e2e/note-header-density.html?state=saved&theme=${theme}${integration ? '&integration' : ''}`);
    assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat', 'Use the same document mode as the production entry');
    const trigger = page.locator('.resource-backlinks__trigger');
    await page.locator('.note-header').waitFor().catch(async error => { console.error(await page.locator('body').innerText()); throw error; });
    if (integration) {
      await page.locator('.note-editor-body.mce-content-body[contenteditable="true"]').waitFor();
    }
    if (viewportWidth < 1200) {
      assert.equal(await trigger.count(), 0, 'Real note header exposes backlinks only on desktop');
      continue;
    }
    await trigger.waitFor();
    for (const density of ['medium', 'small', 'large']) {
      await page.evaluate((density) => window.setDensity(density), density);
      await page.waitForTimeout(350);
      const before = await trigger.boundingBox();
      const headerBefore = await page.locator('.note-header').boundingBox();
      await trigger.click();
      const popup = page.locator('.resource-backlinks-popover');
      await popup.waitFor();
      await page.waitForTimeout(200);
      const after = await trigger.boundingBox();
      const panel = await popup.boundingBox();
      assert.deepEqual(after, before, 'Opening references must not move or resize the header trigger');
      assert.deepEqual(await page.locator('.note-header').boundingBox(), headerBefore);
      assert.ok(panel.y >= after.y + after.height, 'Reference panel must open below the header trigger');
      assert.ok(
        panel.x >= 0 && panel.x + panel.width <= viewportWidth && panel.y + panel.height <= 900,
        'Reference panel stays in the viewport',
      );
      assert.equal(await page.locator('.note-header .resource-backlinks__content').count(), 0);
      // The open panel must follow actual density-driven header reflow.
      const nextDensity = density === 'large' ? 'small' : 'large';
      await page.evaluate(d => window.setDensity(d), nextDensity);
      await page.waitForTimeout(400);
      const moved = await trigger.boundingBox(), movedPanel = await popup.boundingBox();
      assert.ok(Math.abs(movedPanel.y - moved.y - moved.height - 6) < 1, 'Open references follow the real header');
      await page.evaluate(d => window.setDensity(d), density);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `/tmp/header-backlinks-${viewportWidth}-${theme}-${density}.png` });
      await page.keyboard.press('Escape');
      await popup.waitFor({ state: 'detached' });
      await page.locator('.mode-pill').hover();
      const tooltip = page.locator('.b-tooltip-popup').filter({ hasText: /^切换编辑器模式$/ });
      await tooltip.waitFor({ state: 'visible' });
      const mode = await page.locator('.mode-pill').boundingBox();
      const tip = await tooltip.boundingBox();
      assert.ok(tip.y >= mode.y + mode.height, 'Tooltip goes below a trigger at the top viewport edge');
      assert.ok(
        Math.abs(tip.x + tip.width / 2 - mode.x - mode.width / 2) < 2,
        'Mode tooltip remains centered on its trigger',
      );
      await page.screenshot({ path: `/tmp/header-tooltip-${viewportWidth}-${theme}-${density}.png` });
      await page.mouse.move(0, 200);
      await tooltip.waitFor({ state: 'hidden' });
      console.log(`PASS ${theme} ${density}: reference dropdown and mode tooltip`);
    }
  }
  assert.deepEqual(pageErrors, []);
} finally {
  await browser.close();
}

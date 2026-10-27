import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const out = path.join(os.tmpdir(), 'lightnote-message-review');
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  let count = 0;
  const sizes = [];
  try {
    for (const width of [1440, 390, 320])
      for (const theme of ['day', 'night'])
        for (const density of width === 1440 ? ['small', 'standard', 'large'] : ['large']) {
          const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.route('**/api/**', (r) => r.abort());
          await page.goto(
            `${origin}/e2e/message-feedback.html?theme=${theme}&density=${density}${width < 600 ? '&renderProfile=mobile' : ''}`,
          );
          await page.locator('[data-sample=reward]').waitFor();
          for (const sample of ['success', 'info', 'reward', 'batch', 'error', 'warning', 'loading', 'long']) {
            await page.locator(`[data-sample=${sample}]`).click();
            const item = page.locator('.b-message-item');
            await item.waitFor();
            await page.waitForTimeout(280);
            const r = await item.evaluate((el) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return {
                x: r.x,
                y: r.y,
                right: r.right,
                bottom: r.bottom,
                width: r.width,
                height: r.height,
                scroll: el.scrollWidth,
                client: el.clientWidth,
                bg: s.backgroundColor,
                text: el.textContent,
                weight: s.fontWeight,
                html: el.innerHTML,
              };
            });
            assert(r.x >= 0 && r.right <= width + 1, JSON.stringify(r));
            assert(r.scroll <= r.client + 1, `overflow ${width} ${sample}`);
            if (sample === 'reward') assert(!r.text.includes('+0'));
            if (sample === 'loading') {
              assert.equal(await item.locator('.b-loading-inline__indicator i').count(), 3);
              assert(r.height <= (density === 'large' && width === 1440 ? 48 : 44), `loading height ${r.height}`);
            }
            if (width < 600) assert(r.bottom <= 827, `bottom ${r.bottom}`);
            if (sample === 'success') sizes.push({ width, theme, density, height: r.height, messageWidth: r.width });
            if (['reward', 'batch', 'loading'].includes(sample))
              await page.screenshot({ path: `${out}/${width}-${theme}-${density}-${sample}.png` });
            if (width < 600) {
              await item.click();
              await item.waitFor({ state: 'detached' });
            }
            count++;
          }
          await page.close();
        }
    const page = await browser.newPage({ viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });
    await page.goto(`${origin}/e2e/message-feedback.html?renderProfile=mobile&locale=en-US&theme=night`);
    await page.locator('[data-sample=batch]').click();
    await page.waitForTimeout(200);
    assert.match(await page.locator('.b-message-content').innerText(), /Claimed: Daily tasks ×2, Weekly challenges ×1/);
    await page.screenshot({ path: `${out}/320-night-english-reduced-motion.png` });
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(JSON.stringify({ scenarios: count, errors, sizes, screenshots: out }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const out = path.join(os.tmpdir(), 'lightnote-growth-claim-review');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [];
let checked = 0;
try {
  for (const panel of ['workbench', 'growth']) {
    const claimSelector = panel === 'workbench' ? '.claim-button' : '.today-panel__claim';
    const signinSelector = panel === 'workbench' ? '.checkin-button' : '.today-quest__action';
    for (const width of [1440, 390, 320])
      for (const theme of ['day', 'night']) {
        const densities = width === 1440 ? ['small', 'standard', 'large'] : ['standard'];
        for (const density of densities) {
          const scenarios =
            width === 320
              ? ['mixed']
              : width === 1440
                ? ['water', 'signin', 'mixed']
                : ['water', 'signin', 'mixed', 'partial', 'full', 'empty', 'failure'];
          for (const scenario of scenarios) {
            const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
            page.on('pageerror', (error) => errors.push(`${panel}/${scenario}: ${error}`));
            // 仅拦截真正的 API 路径，不能拦截 Vite 的 /src/api/ 模块。
            await page.route(`${origin}/api/**`, (route) => route.abort());
            await page.goto(
              `${origin}/e2e/growth-claim.html?panel=${panel}&scenario=${scenario}&theme=${theme}&density=${density}${width < 600 ? '&renderProfile=mobile' : ''}`,
            );
            await page.waitForFunction(() => Boolean(window.growthClaimFixture));
            const claim = page.locator(claimSelector);
            if (['full', 'empty'].includes(scenario)) {
              await page.waitForFunction(() =>
                window.growthClaimFixture.calls.some((url) => url.endsWith('/growth/claimable')),
              );
              assert.equal(await claim.count(), 0, `${panel}/${scenario}: unexpected claim action`);
            } else {
              await claim.waitFor();
              if (scenario === 'signin') {
                await page.locator(signinSelector).evaluate((element) => {
                  element.click();
                  element.click();
                });
                await page.waitForFunction(() => window.growthClaimFixture.snapshot().signed);
                await page.waitForFunction(
                  () => window.growthClaimFixture.calls.filter((url) => url.endsWith('/growth/claimable')).length >= 2,
                );
                await page.waitForFunction(() =>
                  document.querySelector('.claim-button,.today-panel__claim')?.textContent.includes('1'),
                );
                assert.equal(
                  await page.evaluate(
                    () => window.growthClaimFixture.calls.filter((url) => url.endsWith('/growth/checkin')).length,
                  ),
                  1,
                );
                if (panel === 'growth') assert.equal(await page.locator('.today-track .is-ready').count(), 0);
              }
              await claim.evaluate((element) => {
                element.click();
                element.click();
              });
              if (scenario === 'failure') {
                await page.waitForFunction(() =>
                  window.growthClaimFixture.calls.some((url) => url.endsWith('/growth/claimAll')),
                );
                await page.waitForFunction(
                  () => !document.querySelector('.claim-button,.today-panel__claim')?.disabled,
                );
                assert.equal(await claim.count(), 1);
                assert.equal(await page.locator('.claim-receipt').count(), 0);
              } else {
                const receipt = page.locator('.claim-receipt');
                await receipt.waitFor();
                await receipt.evaluate((element) =>
                  Promise.all(
                    element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
                  ),
                );
                assert.match(await receipt.innerText(), new RegExp(`水滴 \\+${scenario === 'partial' ? 2 : 25}`));
                assert.equal(await claim.count(), 0, `${panel}/${scenario}: already claimed action remained`);
                assert.equal(
                  await page.evaluate(
                    () => window.growthClaimFixture.calls.filter((url) => url.endsWith('/growth/claimAll')).length,
                  ),
                  1,
                );
                const bounds = await receipt.evaluate((element) => {
                  const rect = element.getBoundingClientRect();
                  return {
                    left: rect.left,
                    right: rect.right,
                    scroll: element.scrollWidth,
                    client: element.clientWidth,
                  };
                });
                assert(
                  bounds.left >= 0 && bounds.right <= width + 1,
                  `${panel}/${scenario}/${width}: receipt outside viewport ${JSON.stringify(bounds)}`,
                );
                assert(
                  bounds.scroll <= bounds.client + 1,
                  `${panel}/${scenario}/${width}: receipt clipped ${JSON.stringify(bounds)}`,
                );
                const snapshot = await page.evaluate(() => window.growthClaimFixture.snapshot());
                assert.equal(snapshot.claimable.count, 0);
                assert.equal(snapshot.claimable.manor.water, 0);
                if (scenario === 'partial') assert.equal(snapshot.claimable.manor.pending, 23);
                if (scenario === 'mixed') {
                  const text = await page.locator('body').innerText();
                  assert.match(text, /131 EXP/);
                  if (panel === 'growth') assert(text.includes('360'), 'balance did not refresh after mixed reward');
                }
                await page.screenshot({
                  path: path.join(out, `${panel}-${width}-${theme}-${density}-${scenario}.png`),
                  fullPage: false,
                });
                if (scenario === 'water' && density === 'standard') {
                  await page.evaluate(
                    (p) => window.growthClaimFixture.visit(p),
                    panel === 'workbench' ? '/growth' : '/workbenches',
                  );
                  await page.locator(panel === 'workbench' ? '.today-panel' : '.growth-card').waitFor();
                  assert.equal(
                    await page.locator('.claim-button,.today-panel__claim').count(),
                    0,
                    'other entry retained old claim state',
                  );
                  if (panel === 'growth')
                    assert.match(await page.locator('[data-attention]').innerText(), /暂无可领水滴/);
                }
              }
            }
            checked += 1;
            await page.close();
          }
        }
      }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checked, screenshots: out, pageErrors: errors.length }));
} finally {
  await browser.close();
}

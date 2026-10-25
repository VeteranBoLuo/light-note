import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const output = await mkdtemp(join(tmpdir(), 'lightnote-store-height-'));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const results = [];
const cases = [];
for (const theme of ['day', 'night']) {
  for (const locale of ['zh-CN', 'en-US']) {
    for (const density of ['small', 'default', 'large']) cases.push({ width: 1440, density, theme, locale });
    for (const width of [320, 390]) cases.push({ width, density: 'small', theme, locale });
  }
}
for (const state of ['guest', 'preview', 'state-loading', 'state-error']) {
  cases.push({ width: 390, density: 'small', theme: 'day', locale: 'zh-CN', state });
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { top: box.top, height: box.height };
    };
    const scroll = document.querySelector('.store-page__scroll');
    return {
      catalog: rect('.store-catalog'),
      tabs: rect('.store-tabs'),
      packages: rect('.package-panels'),
      following: rect('.store-bottom-grid'),
      scrollTop: scroll.scrollTop,
      scrollHeight: scroll.scrollHeight,
      cards: [...document.querySelectorAll('[role="tabpanel"][aria-hidden="false"] .package-card')].map((card) => {
        const box = card.getBoundingClientRect();
        if (card.scrollWidth > card.clientWidth + 1) throw new Error('Package content overflows');
        return { top: box.top, height: box.height };
      }),
    };
  });
}

function equalLayout(actual, expected, context) {
  for (const key of ['catalog', 'tabs', 'packages', 'following']) {
    for (const metric of ['top', 'height']) {
      assert.ok(
        Math.abs(actual[key][metric] - expected[key][metric]) <= 1,
        `${context}: ${key}.${metric} ${expected[key][metric]} → ${actual[key][metric]}`,
      );
    }
  }
  for (const key of ['scrollTop', 'scrollHeight'])
    assert.ok(Math.abs(actual[key] - expected[key]) <= 1, `${context}: ${key}`);
  assert.equal(actual.cards.length, 4, context);
  actual.cards.forEach((card, index) => {
    for (const metric of ['top', 'height']) {
      assert.ok(Math.abs(card[metric] - expected.cards[index][metric]) <= 1, `${context}: card ${index} ${metric}`);
    }
  });
}

try {
  for (const fixture of cases) {
    const name = `${fixture.width}-${fixture.theme}-${fixture.locale}-${fixture.density}-${fixture.state || 'ready'}`;
    const page = await browser.newPage({ viewport: { width: fixture.width, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const params = new URLSearchParams({
      ...fixture,
      category: 'ai',
      state: fixture.state || 'hidden',
      renderProfile: 'mobile',
    });
    await page.goto(`${origin}/e2e/support-packages.html?${params}`, { waitUntil: 'networkidle' });
    await page.locator('[role="tabpanel"][aria-hidden="false"] .package-card').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.store-page__scroll').evaluate((scroll) => {
      const catalog = scroll.querySelector('.store-catalog');
      scroll.scrollTop += catalog.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24;
    });
    const baseline = await measure(page);
    const labels =
      fixture.locale === 'zh-CN' ? ['AI 额度', '云空间', '组合套餐'] : ['AI quota', 'Cloud storage', 'Bundles'];
    for (const index of [1, 2, 0, 2, 1, 0]) {
      await page.getByRole('tab', { name: labels[index], exact: true }).click();
      await page.waitForFunction(
        (label) =>
          document.querySelector('[role="tabpanel"][aria-hidden="false"]')?.getAttribute('aria-label') === label,
        labels[index],
      );
      assert.equal(await page.locator('.package-card:visible').count(), 4, name);
      assert.equal(await page.getByRole('tabpanel').count(), 1, name);
      assert.equal(await page.locator('[role="tabpanel"][aria-hidden="true"][inert]').count(), 2, name);
      equalLayout(await measure(page), baseline, `${name}/${labels[index]}`);
    }
    await page.getByRole('tab', { name: labels[0], exact: true }).focus();
    await page.keyboard.press('End');
    await page.waitForFunction(
      (label) => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() === label,
      labels[2],
    );
    equalLayout(await measure(page), baseline, `${name}/keyboard`);
    const buttons = page.getByRole('tabpanel').getByRole('button');
    if (fixture.state) {
      assert.ok(await buttons.evaluateAll((nodes) => nodes.every((button) => button.disabled)), name);
    } else {
      await buttons.first().click();
      await page.locator('.checkout-modal').waitFor();
      assert.ok((await page.locator('.checkout-modal').innerText()).includes('256 MB'), name);
      await page.getByRole('button', { name: fixture.locale === 'zh-CN' ? '再想想' : 'Not now', exact: true }).click();
      await page.locator('.checkout-modal').waitFor({ state: 'hidden' });
    }
    if (
      (fixture.locale === 'zh-CN' && fixture.density === 'default') ||
      (fixture.width === 390 && fixture.locale === 'zh-CN') ||
      (fixture.width === 320 && fixture.locale === 'en-US' && fixture.theme === 'night')
    ) {
      await page.screenshot({ path: join(output, `${name}.png`) });
    }
    assert.deepEqual(errors, [], name);
    results.push({ name, height: baseline.packages.height, passed: true });
    await page.close();
  }
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length, output }, null, 2));
} finally {
  await browser.close();
}

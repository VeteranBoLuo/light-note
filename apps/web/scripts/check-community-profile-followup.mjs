import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of [1440, 390])
    for (const theme of ['day', 'night'])
      for (const locale of ['zh-CN', 'en-US']) {
        const p = await browser.newPage({ viewport: { width, height: 900 } });
        const warnings = [];
        p.on('console', (m) => {
          if (m.text().includes('[intlify]')) warnings.push(m.text());
        });
        await p.goto(
          `http://localhost:5173/e2e/community-p2.html?account=a&theme=${theme}&locale=${locale}${width < 768 ? '&renderProfile=mobile' : ''}`,
        );
        await p.locator('.community-post-card').first().waitFor();
        const origin = await p.locator('.community-page-title').first().boundingBox();
        for (const route of ['manage', 'preferences', 'profile']) {
          await p.evaluate((route) => window.communityFixture.router.push('/community/' + route), route);
          await p.locator('.community-page-title').waitFor({ state: 'attached' });
          if (width > 768) {
            const rect = await p.locator('.community-page-title').first().boundingBox();
            assert(Math.abs(rect.x - origin.x) < 1, `${route}: ${rect.x} vs ${origin.x}`);
            assert(Math.abs(rect.y - origin.y) < 1, `${route}: y ${rect.y} vs ${origin.y}`);
          }
        }
        await p.locator('.featured-choices button').first().waitFor();
        assert.equal(await p.locator('.interest-choices').count(), 0);
        assert.equal(
          await p.getByRole('button', { name: locale === 'en-US' ? 'Load more' : '加载更多', exact: true }).count(),
          0,
        );
        const list = p.locator('.featured-choices');
        const before = await p.evaluate(
          () => window.communityFixture.calls.filter((c) => c.url.endsWith('own/posts')).length,
        );
        await list.evaluate((e) => (e.scrollTop = e.scrollHeight));
        await p.waitForFunction(
          (before) => window.communityFixture.calls.filter((c) => c.url.endsWith('own/posts')).length > before,
          before,
        );
        assert((await list.locator('button').count()) < 20);
        await p.locator('.community-own-profile').evaluate((e) => (e.scrollTop = 0));
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await p.screenshot({ path: `/tmp/community-followup-${width}-${theme}-${locale}.png` });
        await p.route('**/api/community/own/comments*', (r) =>
          r.fulfill({ json: { status: 200, data: { items: [], nextCursor: null } } }),
        );
        await p.evaluate(() => window.communityFixture.router.push('/community/manage'));
        await p.getByRole('tab', { name: locale === 'en-US' ? 'Comments' : '评论', exact: true }).click();
        await p.locator('.management-empty').waitFor();
        assert.equal(
          await p
            .locator('.management-empty')
            .innerText()
            .then((t) => t.includes('community.feed.')),
          false,
        );
        assert.deepEqual(warnings, []);
        await p.close();
        console.log('PASS', width, theme, locale);
      }
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let failures = 0,
    fail = true;
  await p.route('**/api/community/own/posts?*', (r) => {
    if (fail && new URL(r.request().url()).searchParams.has('before')) {
      failures++;
      return r.abort();
    }
    return r.continue();
  });
  await p.goto('http://localhost:5173/e2e/community-p2.html?account=a');
  await p.waitForFunction(() => window.communityFixture?.router);
  await p.evaluate(() => window.communityFixture.router.push('/community/profile'));
  await p.locator('.featured-choices button').first().waitFor();
  await p.locator('.featured-choices').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await p.locator('.showcase-section [role=alert]').waitFor();
  await p.waitForTimeout(500);
  assert.equal(failures, 1);
  assert((await p.locator('.featured-choices button').count()) > 0);
  fail = false;
  await p.locator('.showcase-section [role=alert] button').click();
  await p.locator('.showcase-section [role=alert]').waitFor({ state: 'detached' });
  await p.close();
  console.log('PASS continuation failure pauses and retains rows; retry resumes');
} finally {
  await browser.close();
}

import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  let failures = 0,
    fail = true;
  await p.route('http://127.0.0.1:19092/api/community/posts?*', async (route) => {
    if (fail && new URL(route.request().url()).searchParams.has('before')) {
      failures++;
      await route.abort();
    } else await route.continue();
  });
  await p.goto('http://localhost:5173/e2e/community-p2.html?account=a');
  await p.locator('.feed-post').first().waitFor();
  await p.locator('.community-feed').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await p.locator('.feed-loading-region .feed-error').waitFor();
  await p.waitForTimeout(800);
  assert.equal(failures, 1);
  assert.ok((await p.locator('.feed-post').count()) > 0);
  fail = false;
  await p.locator('.feed-loading-region .feed-error button').click();
  await p.waitForFunction(() => document.querySelectorAll('.feed-loading-region .feed-error').length === 0);
  await p.waitForTimeout(500);
  await p.locator('.community-feed').evaluate((e) => (e.scrollTop += 300));
  const anchor = await p.locator('.community-feed').evaluate((e) => {
    const top = e.getBoundingClientRect().top;
    const c = [...e.querySelectorAll('[data-post-id]')].find((c) => c.getBoundingClientRect().bottom > top);
    return { id: c.dataset.postId, offset: c.getBoundingClientRect().top - top };
  });
  await p.evaluate((id) => window.communityFixture.router.push('/community/posts/' + id), anchor.id);
  await p.locator('.discussion-actions').waitFor();
  await p.evaluate(() => window.communityFixture.router.push('/community/feed'));
  await p.locator('.feed-loading-region[aria-busy=false]').waitFor();
  await p.waitForTimeout(500);
  const offset = await p
    .locator(`[data-post-id="${anchor.id}"]`)
    .evaluate((e) => e.getBoundingClientRect().top - e.closest('.community-feed').getBoundingClientRect().top);
  assert.ok(Math.abs(offset - anchor.offset) < 5, JSON.stringify({ anchor, offset }));
  console.log('PASS: failed continuation pauses, keeps posts, retries; virtual list returns to reading anchor');
} finally {
  await b.close();
}

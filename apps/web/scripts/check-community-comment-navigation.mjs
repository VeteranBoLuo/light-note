import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of [1470, 390]) {
    const p = await b.newPage({ viewport: { width, height: 850 } });
    await p.goto(
      `http://localhost:5173/e2e/community-p2.html?fixturePort=${process.env.COMMUNITY_FIXTURE_PORT || '19093'}&account=b${width < 768 ? '&renderProfile=mobile' : ''}`,
    );
    await p.locator('.feed-excerpt').first().click();
    await p.locator('.community-discussion').waitFor();
    await p.route('**/api/community/comments/context?*', (r) =>
      r.fulfill({ json: { status: 200, data: { before: 'context-cursor', root: null } } }),
    );
    await p.route('**/api/community/comments?*', (r) =>
      r.fulfill({
        json: {
          status: 200,
          data: {
            items: Array.from({ length: 20 }, (_, i) => ({
              publicId: 'target-' + i,
              author: { name: '成员 ' + i, userPublicId: 'qa-user' },
              status: 'published',
              body: '评论定位验收内容 ' + i,
              revision: 1,
              replyCount: 0,
            })),
            nextCursor: null,
          },
        },
      }),
    );
    await p.evaluate(() =>
      window.communityFixture.router.replace({
        path: window.communityFixture.router.currentRoute.value.path,
        query: { comment: 'target-15' },
      }),
    );
    await p.locator('#comment-target-15').waitFor();
    await p.waitForTimeout(500);
    const visible = await p.locator('#comment-target-15').evaluate((e) => {
      const a = e.getBoundingClientRect(),
        b = e.closest('.comment-list').getBoundingClientRect();
      return a.bottom > b.top && a.top < b.bottom;
    });
    assert(visible);
    console.log('PASS comment target', width);
    await p.close();
  }
} finally {
  await b.close();
}

import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of (process.env.QA_WIDTHS || '1440,390,320').split(',').map(Number))
    for (const theme of ['day', 'night']) {
      const p = await browser.newPage({ viewport: { width, height: Number(process.env.QA_HEIGHT || 900) } });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(
        `http://localhost:5173/e2e/community-p2.html?account=a&achievements&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      await p.locator('.community-post-card').first().waitFor();
      await p.screenshot({ path: `/tmp/redesign-feed-${width}-${theme}.png` });
      assert.equal(await p.getByRole('button', { name: '加载更多', exact: true }).count(), 0);
      await p.evaluate(() => window.communityFixture.router.push('/community/manage'));
      await p.locator('.management-tabs').waitFor();
      await p.locator('.feed-loading-region[aria-busy=false]').waitFor();
      await p.screenshot({ path: `/tmp/redesign-manage-${width}-${theme}.png` });
      if (width === 1440 && theme === 'day') {
        await p.locator('.community-feed').evaluate((e) => (e.scrollTop = e.scrollHeight));
        await p.waitForFunction(() =>
          window.communityFixture.calls.some((c) => c.url.includes('own/posts') && c.params?.before),
        );
      }
      for (const [tab, key] of [
        ['评论', 'comments'],
        ['处理结果', 'results'],
      ]) {
        await p.route(`**/api/community/own/${key}*`, (r) =>
          r.fulfill({ json: { status: 200, data: { items: [], nextCursor: null } } }),
        );
        await p.getByRole('tab', { name: tab, exact: true }).click();
        await p.locator('.management-empty').waitFor();
        assert.match(
          await p.locator('.management-empty h2').innerText(),
          key === 'comments' ? /暂无评论/ : /暂无处理结果/,
        );
      }
      await p.waitForTimeout(350);
      await p.screenshot({ path: `/tmp/redesign-empty-${width}-${theme}.png` });
      await p.evaluate(() => window.communityFixture.router.push('/community/profile'));
      await p.locator('.bio-field textarea').fill('让知识在交流中生长。');
      assert.equal(
        await p.locator('.preview-card .chat-profile-content__bio > p:first-of-type').innerText(),
        '让知识在交流中生长。',
      );
      assert.equal(await p.locator('.preview-card .chat-profile-content__identity-copy > small').count(), 1);
      assert.equal(await p.locator('.preview-card .chat-profile-content__level').count(), 1);
      await p.locator('.tenure-field [role=switch]').click();
      assert.equal(await p.locator('.preview-card .chat-profile-content__tenure').count(), 0);
      await p.locator('.tenure-field [role=switch]').click();
      await p.locator('.preview-card .chat-profile-content__tenure').waitFor();
      const choices = p.locator('.achievement-choices button');
      await choices.nth(0).click();
      await choices.nth(1).click();
      await choices.nth(2).click();
      assert.equal(await choices.nth(3).isDisabled(), true);
      assert.equal(await p.locator('.preview-card .chat-profile-content__achievement').count(), 3);
      await choices.nth(0).click();
      assert.equal(await choices.nth(3).isEnabled(), true);
      await choices.nth(3).click();
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await p.locator('.community-own-profile').evaluate((e) => (e.scrollTop = 0));
      await p.screenshot({ path: `/tmp/redesign-profile-${width}-${theme}.png` });
      if (width === 1470) {
        const card = await p.locator('.profile-live-preview').boundingBox();
        const footer = await p.locator('.profile-editor > footer').boundingBox();
        assert(card.y + card.height <= footer.y, JSON.stringify({ card, footer }));
      }
      await p.locator('.profile-live-preview').screenshot({ path: `/tmp/redesign-card-${width}-${theme}.png` });
      assert.equal(
        await p
          .locator('.preview-card .chat-profile-content__view-all, .preview-card .chat-profile-content__privacy')
          .count(),
        0,
      );
      assert.deepEqual(errors, []);
      await p.close();
      console.log('PASS', width, theme);
    }
} finally {
  await browser.close();
}

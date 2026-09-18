import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of [1440, 390])
    for (const theme of ['day', 'night']) {
      const p = await b.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => {
        if (m.type() === 'error') console.log(m.text());
      });
      await p.goto(
        `http://localhost:5173/e2e/community-p2.html?account=a&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      await p.locator('.feed-post').first().waitFor();
      await p.locator('.feed-search input').fill('unsubmitted-search');
      await p.locator('.community-feed').evaluate((e) => (e.scrollTop = e.scrollHeight));
      await p.waitForFunction(() => window.communityFixture.calls.some((c) => c.params?.before));
      assert.ok(
        await p.evaluate(() => window.communityFixture.calls.filter((c) => c.params?.before).every((c) => !c.params.q)),
      );
      assert.ok((await p.locator('.feed-post').count()) < 35);
      const post = await p.locator('.feed-post').last().getAttribute('data-post-id');
      await p.evaluate((id) => window.communityFixture.router.push('/community/posts/' + id), post);
      await p.locator('.discussion-actions').waitFor();
      await p.screenshot({ path: `/tmp/community-${width}-${theme}-actions.png` });
      assert.equal(await p.locator('.discussion-actions .discussion-open-comments').count(), 1);
      await p.evaluate(() => window.communityFixture.router.push('/community/feed'));
      await p.getByRole('button', { name: '发布内容', exact: true }).click();
      assert.equal(await p.getByRole('tab', { name: '富文本', exact: true }).getAttribute('aria-selected'), 'true');
      await p.getByRole('tab', { name: 'Markdown', exact: true }).click();
      await p.locator('.writing-body .cm-content').fill('## 保留标题\n\n这段内容有 **加粗**，还有一段正文。');
      await p.getByRole('tab', { name: '富文本', exact: true }).click();
      const rich = p.frameLocator('.writing-body iframe').locator('body[contenteditable=true]');
      await rich.waitFor();
      assert.match(await rich.innerText(), /保留标题/);
      await rich.fill('富文本新增的内容');
      await p.getByRole('tab', { name: 'Markdown', exact: true }).click();
      assert.match(await p.locator('.writing-body .cm-content').innerText(), /富文本新增的内容/);
      await p.getByRole('tab', { name: '富文本', exact: true }).click();
      await rich.waitFor();
      await p.screenshot({ path: `/tmp/community-${width}-${theme}-rich.png` });
      await p.getByRole('button', { name: '预览', exact: true }).click();
      assert.match(await p.locator('.writing-preview').innerText(), /富文本新增的内容/);
      await p.getByRole('button', { name: '发布', exact: true }).click();
      await p.locator(width < 768 ? '.mobile-submit' : '.community-publish-confirm').waitFor();
      assert.equal(
        await p.locator('.community-publish-confirm').getByRole('button', { name: '分享', exact: true }).count(),
        0,
      );
      if (width === 1440 && theme === 'day') {
        const response = p.waitForResponse(
          (r) => r.url().includes('19092/api/community/posts') && r.request().method() === 'POST',
        );
        await p.getByRole('button', { name: '提交审核', exact: true }).click();
        const result = await response;
        assert.equal(result.status(), 200);
        const payload = result.request().postDataJSON();
        assert.equal(payload.kind, 'share');
        assert.match(payload.body, /富文本新增的内容/);
      }
      assert.deepEqual(errors, []);
      console.log('PASS', width, theme);
      await p.close();
    }
} finally {
  await b.close();
}

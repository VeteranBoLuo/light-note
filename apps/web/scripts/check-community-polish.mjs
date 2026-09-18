import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const output = '/tmp/community-polish';
await mkdir(output, { recursive: true });
const errors = [];
const go = (p, path) => p.evaluate((path) => window.communityFixture.router.push(path), path);
try {
  for (const width of [1440, 1024, 390, 320])
    for (const theme of ['day', 'night']) {
      const p = await browser.newPage({ viewport: { width, height: 1000 } });
      p.on('pageerror', (error) => errors.push(error.message));
      await p.goto(
        `http://localhost:5173/e2e/community-p2.html?account=a&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      await p.locator('.feed-post').first().waitFor();
      if (width >= 768) {
        const box = await p.locator('.community-navigation-footer').evaluate((el) => {
          const r = el.getBoundingClientRect();
          const nav = el.closest('.community-layout-nav').getBoundingClientRect();
          return { height: r.height, left: r.left - nav.left, right: nav.right - r.right };
        });
        assert.ok(box.height <= 58 && Math.abs(box.left) <= 1 && Math.abs(box.right) <= 1, JSON.stringify(box));
      }
      const topics = p.locator(width >= 1200 ? '.context-topic' : '.feed-mobile-topics button');
      await topics.nth(1).click();
      await p.waitForFunction(() =>
        window.communityFixture.calls.some((c) => c.method === 'get' && c.url.endsWith('/posts') && c.params?.topic),
      );
      assert.equal(await topics.nth(1).getAttribute('aria-pressed'), 'true');
      await p.locator('.feed-loading-region[aria-busy=false]').waitFor();
      await p.screenshot({ path: `${output}/${width}-${theme}-feed.png` });
      await topics.first().click();
      assert.equal(await topics.first().getAttribute('aria-pressed'), 'true');
      await go(p, '/community/manage');
      await p.locator('.managed-post').first().waitFor();
      await p.getByRole('tab', { name: '评论', exact: true }).click();
      await p.getByRole('tab', { name: '帖子', exact: true }).click();
      await p.locator('.managed-post').first().waitFor();
      await p.locator('.feed-loading-region[aria-busy=false]').waitFor();
      await p.screenshot({ path: `${output}/${width}-${theme}-manage.png` });
      await p.getByRole('button', { name: '发布内容', exact: true }).click();
      await p.locator('.b-drawer-wrapper.is-settled').waitFor();
      await p
        .locator('.writing-body .cm-content')
        .fill('整理资料时，先给每个项目留一个入口。\n\n每周回顾一次，让记录成为可复用的经验。');
      await p.locator('#feed-title').fill('把零散记录整理成自己的知识');
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await p.screenshot({ path: `${output}/${width}-${theme}-editor.png` });
      await p.getByRole('button', { name: '预览', exact: true }).click();
      await p.locator('.writing-preview').waitFor();
      await p.getByRole('button', { name: '继续编辑', exact: true }).click();
      assert.match(await p.locator('.writing-body .cm-content').innerText(), /整理资料/);
      await p.getByRole('button', { name: '发布', exact: true }).click();
      await p.locator('.community-publish-confirm').waitFor();
      await p.waitForTimeout(350);
      await p.screenshot({ path: `${output}/${width}-${theme}-confirm.png` });
      await p.close();
    }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: compact full-width account footer; direct topic filtering and clearing; management tabs; writing/preview/confirmation; 8 viewport/theme combinations.',
  );
} finally {
  await browser.close();
}

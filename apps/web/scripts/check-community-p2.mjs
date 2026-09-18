import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const fixturePort = process.env.COMMUNITY_FIXTURE_PORT || '19095';
const errors = [];
await mkdir('/tmp/lightnote-community-p2-qa', { recursive: true });
async function page(account, width = 1440, theme = 'day') {
  const p = await browser.newPage({ viewport: { width, height: 1000 } });
  p.setDefaultTimeout(15000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(
    `${origin}/e2e/community-p2.html?fixturePort=${fixturePort}&account=${account}&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`,
  );
  await p.waitForSelector('.feed-post');
  return p;
}
const go = (p, path) => p.evaluate((path) => window.communityFixture.router.push(path), path);
async function notifications(account) {
  return (
    await (
      await fetch(`http://127.0.0.1:${fixturePort}/fixture/notifications`, {
        headers: { 'X-Fixture-Account': account },
      })
    ).json()
  ).data.items;
}
try {
  const a = await page('a'),
    b = await page('b'),
    root = await page('root');
  const title = '双账号讨论 ' + Date.now();
  await a.getByRole('button', { name: '发布内容', exact: true }).click();
  await a.locator('#feed-title').fill(title);
  await a.getByRole('tab', { name: 'Markdown', exact: true }).click();
  await a.locator('.writing-body .cm-content').fill('想请大家分享整理资料的方法。');
  await a.getByRole('button', { name: '发布', exact: true }).click();
  await a.getByRole('button', { name: '提交审核', exact: true }).click();
  await a.waitForTimeout(800);
  await go(a, '/community/manage');
  await a.waitForSelector('.feed-status');
  assert.match(await a.locator('body').innerText(), /待审核/);
  await go(root, '/community/moderation');
  await root
    .locator('.feed-post')
    .filter({ hasText: title })
    .getByRole('button', { name: '批准', exact: true })
    .click();
  await root.getByRole('dialog').getByRole('textbox').fill('符合讨论规则');
  await root.getByRole('button', { name: '确认', exact: true }).click();
  await root.getByRole('dialog').waitFor({ state: 'hidden' });
  await go(b, '/community/chat');
  await b.getByRole('button', { name: '广场', exact: true }).click();
  await b.getByRole('textbox', { name: '搜索标题和正文', exact: true }).fill(title);
  await b.getByRole('button', { name: '搜索', exact: true }).click();
  await b.getByRole('link', { name: title, exact: true }).click();
  await b.locator('.discussion-open-comments').click();
  await b.locator('.comment-composer textarea').fill('可以先按项目分组，再每周整理。');
  await b.getByRole('button', { name: '发表评论', exact: true }).click();
  await b.getByText('可以先按项目分组，再每周整理。', { exact: true }).waitFor();
  const an = await notifications('a');
  const n = an.find((x) => JSON.parse(typeof x.meta === 'string' ? x.meta : JSON.stringify(x.meta)).kind === 'comment');
  assert.ok(n, 'author receives comment notification');
  await go(a, n.link);
  await a.waitForSelector('.is-located');
  await a.locator('.feed-comment').first().getByRole('button', { name: '回复', exact: true }).click();
  await a.locator('.feed-comment .comment-composer textarea').fill('谢谢，这个方法很实用。');
  await a.locator('.feed-comment .comment-composer').getByRole('button', { name: '回复', exact: true }).click();
  await a.getByText('谢谢，这个方法很实用。', { exact: true }).waitFor();
  const bn = await notifications('b');
  const replyNotification = bn.find(
    (x) => x.source_type === 'community_feed_comment' && x.link.split('?')[0] === n.link.split('?')[0],
  );
  assert.ok(replyNotification);
  await go(b, replyNotification.link);
  await b.waitForSelector('.is-located');
  await b.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await b.getByRole('button', { name: '点赞', exact: true }).click();
  await b.getByRole('button', { name: '已赞', exact: true }).waitFor();
  assert.equal((await notifications('a')).length, an.length);
  await go(a, '/community');
  await a.waitForSelector('.community-workspace');
  assert.equal(await a.locator('.community-message.is-focused').count(), 0);
  for (const width of [1440, 1024, 390, 320])
    for (const theme of ['day', 'night']) {
      const p = await page('b', width, theme);
      assert.ok((await p.locator('.feed-post').count()) < 20);
      await p.locator('.community-feed').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await p.waitForFunction(() => window.communityFixture.calls.some((call) => call.params?.before));
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await p.locator('.community-feed').evaluate((el) => (el.scrollTop = 0));
      await p.waitForTimeout(600);
      await p.screenshot({ path: `/tmp/lightnote-community-p2-qa/${width}-${theme}-feed.png` });
      await p.getByRole('link', { name: title, exact: true }).click();
      await p.locator('.discussion-open-comments').click();
      await p.locator('.comment-composer textarea').waitFor();
      await p.waitForTimeout(600);
      await p.screenshot({ path: `/tmp/lightnote-community-p2-qa/${width}-${theme}-detail.png` });
      await p.close();
    }
  console.log(
    'P2 browser passed: isolated MySQL two-account publishing/review/reply/notification locate; likes silent; fixed chat entry without spurious focus; pagination and 8 viewport/theme combinations.',
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

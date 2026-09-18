import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const output = '/tmp/lightnote-community-acceptance';
await mkdir(output, { recursive: true });
const errors = [];
async function page(account, extra = '') {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.setDefaultTimeout(12000);
  p.on('pageerror', (error) => errors.push(error.message));
  await p.goto(`http://localhost:5173/e2e/community-p2.html?account=${account}${extra}`);
  await p.waitForFunction(() => Boolean(window.communityFixture?.router));
  return p;
}
const go = (p, path) => p.evaluate((path) => window.communityFixture.router.push(path), path);
const closeDialog = (p) => p.getByRole('dialog').last().getByRole('button', { name: '关闭', exact: true }).click();
try {
  const root = await page('root'),
    member = await page('b');
  await root.getByRole('button', { name: '发布内容', exact: true }).click();
  const title = '图片与草稿验收 ' + Date.now();
  await root.locator('#feed-title').fill(title);
  await root.locator('.writing-body .cm-content').fill('本地隔离验收：图片草稿应在关闭编辑器后保留。');
  await root.locator('input[type=file]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ff8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await root.locator('.writing-image img').waitFor();
  await root.getByRole('button', { name: '发布', exact: true }).waitFor({ state: 'visible' });
  await root.waitForFunction(() => !document.querySelector('.writing-image-actions button')?.disabled);
  await closeDialog(root);
  await root.getByRole('button', { name: '发布内容', exact: true }).click();
  assert.equal(await root.locator('#feed-title').inputValue(), title);
  assert.equal(await root.locator('.writing-image img').count(), 1);
  await root.getByRole('button', { name: '发布', exact: true }).click();
  await root.getByRole('button', { name: '提交审核', exact: true }).click();
  await root.locator('.community-writing').waitFor({ state: 'hidden' });
  await go(root, '/community/manage');
  const card = root.locator('.feed-post').filter({ hasText: title });
  await card.getByRole('button', { name: '查看帖子', exact: true }).click();
  await root.locator('.community-discussion').waitFor();
  const detail = await root.evaluate(() => window.communityFixture.router.currentRoute.value.path);
  await go(member, detail);
  await member.locator('.community-post-images img').first().waitFor();
  assert.equal(await member.locator('.community-post-images img').count(), 1);
  await member.locator('.post-author').first().click();
  await member.getByRole('button', { name: '关注', exact: true }).click();
  await member.getByRole('button', { name: '取消关注', exact: true }).waitFor();
  await member.getByRole('button', { name: '取消关注', exact: true }).click();
  await member.getByRole('button', { name: '关注', exact: true }).waitFor();
  await go(member, detail);
  await member.locator('.community-content-more').click();
  await member.getByRole('menuitem', { name: '举报', exact: true }).click();
  assert.equal(await member.locator('#community-comment:visible').count(), 0);
  await member.getByRole('dialog').getByRole('textbox').fill('隔离测试：核对举报与评论分离。');
  await member.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await member.getByRole('dialog').waitFor({ state: 'hidden' });
  await go(root, detail);
  await root.locator('.post-author').first().click();
  await root.getByRole('button', { name: '编辑社区资料', exact: true }).click();
  await root.locator('.community-own-profile').waitFor();
  await root.locator('.bio-field textarea').fill('隔离环境更新的社区简介');
  await root.getByRole('button', { name: '保存社区资料', exact: true }).click();
  await root.waitForFunction(() => document.querySelector('.profile-editor footer button')?.disabled);
  await go(root, '/community/chat');
  await go(root, '/community/profile');
  await root.locator('.bio-field textarea').waitFor();
  assert.equal(await root.locator('.bio-field textarea').inputValue(), '隔离环境更新的社区简介');
  await go(root, detail);
  await root.locator('.community-content-more').click();
  await root.getByRole('menuitem', { name: '撤回', exact: true }).click();
  await root.locator('.bAlert').getByRole('button', { name: '确定', exact: true }).click();
  await root.locator('.bAlert').waitFor({ state: 'hidden' });
  await go(member, '/community/feed');
  await go(member, detail);
  await member.getByText(/内容暂不可用/).waitFor();
  for (const suffix of ['&readonly', '&closed', '&failfeed', '&guest']) {
    const p = await page('b', suffix);
    await go(p, '/community/chat');
    await p.locator('.community-workspace').waitFor();
    assert.equal(await p.locator('.community-message.is-focused').count(), 0);
    await p.close();
  }
  const chat = await page('a');
  await go(chat, '/community/chat');
  await chat.locator('.community-composer textarea').fill('尚未发送的聊天草稿');
  await go(chat, '/community/feed');
  await chat.locator('.feed-filters').waitFor();
  await go(chat, '/community/chat');
  assert.equal(await chat.locator('.community-composer textarea').inputValue(), '尚未发送的聊天草稿');
  assert.equal(await chat.locator('.community-message.is-focused').count(), 0);
  for (const width of [1440, 320])
    for (const theme of ['day', 'night']) {
      const p = await page('b', `&theme=${theme}${width === 320 ? '&renderProfile=mobile' : ''}`);
      await p.setViewportSize({ width, height: 900 });
      await p.reload();
      await p.locator('.feed-post').first().waitFor();
      await p.locator('.feed-post h2 a').first().click();
      await p.locator('.discussion-open-comments').click();
      await p.locator('#community-comment').waitFor();
      await p.waitForTimeout(400);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await p.screenshot({ path: `${output}/${width}-${theme}-comments.png` });
      await p.close();
    }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: image draft/reopen/publication; follow/unfollow; report separation; own-profile editing; withdrawal; disabled/read-only/failure/guest chat fallback; chat draft; desktop/mobile comment drawer.',
  );
} finally {
  await browser.close();
}

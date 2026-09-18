import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const output = '/tmp/lightnote-community-resources';
await mkdir(output, { recursive: true });
const errors = [];
async function page(account, extra = '', width = 1440) {
  const p = await browser.newPage({ viewport: { width, height: 900 } });
  p.setDefaultTimeout(12000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:5173/e2e/community-p2.html?account=${account}${extra}`);
  await p.waitForFunction(() => Boolean(window.communityFixture?.router));
  return p;
}
const close = (p) => p.getByRole('dialog').last().getByRole('button', { name: '关闭', exact: true }).click();
try {
  const root = await page('root');
  await root.getByRole('button', { name: '发布内容', exact: true }).click();
  const title = '固定资源版本验收 ' + Date.now();
  await root.locator('#feed-title').fill(title);
  await root.locator('.writing-body .cm-content').fill('分享文字笔记与书签，后续编辑原资源不会同步。');
  await root.getByRole('button', { name: '分享我的资源', exact: true }).click();
  await root.getByRole('button', { name: /我的知识整理方法/ }).waitFor();
  assert.equal(await root.getByRole('button', { name: /含图片的旅行笔记/ }).count(), 0);
  await root.getByRole('button', { name: /我的知识整理方法/ }).click();
  await root.locator('.snapshot-preview').waitFor();
  assert((await root.locator('.snapshot-text').innerText()).includes('每天留出十分钟'));
  await root.screenshot({ animations: 'disabled', path: output + '/desktop-preview.png' });
  await root.getByRole('button', { name: '确认并添加', exact: true }).click();
  await root.getByRole('button', { name: '分享我的资源', exact: true }).click();
  await root.getByRole('button', { name: /MDN 网页开发文档/ }).click();
  await root.getByRole('button', { name: '确认并添加', exact: true }).click();
  assert.equal(await root.locator('.community-writing .resource-card').count(), 2);
  await close(root); // Save draft when leaving editor.
  await root.getByRole('button', { name: '发布内容', exact: true }).click();
  assert.equal(await root.locator('.community-writing .resource-card').count(), 2);
  await root.getByRole('button', { name: '发布', exact: true }).click();
  await root.getByRole('button', { name: '提交审核', exact: true }).click();
  await root.locator('.community-writing').waitFor({ state: 'hidden' });
  await root.waitForFunction(() => window.communityFixture.router.currentRoute.value.path === '/community/manage');
  await root
    .locator('.feed-post')
    .filter({ hasText: title })
    .getByRole('button', { name: '查看帖子', exact: true })
    .click();
  const article = root.locator('article[data-post-id]').filter({ hasText: title }).first();
  await article.waitFor();
  const postId = await article.getAttribute('data-post-id');
  await article.locator('.resource-card').first().click();
  await root.locator('.resource-text').waitFor();
  await close(root);
  for (const [width, theme] of [
    [1440, 'day'],
    [1440, 'night'],
    [390, 'day'],
    [390, 'night'],
    [320, 'day'],
    [320, 'night'],
  ]) {
    const p = await page('b', `&theme=${theme}${width < 768 ? '&renderProfile=mobile' : ''}`, width);
    const card = p.locator('article[data-post-id]').filter({ hasText: title }).first();
    await card.locator('.resource-card').first().click();
    await p.locator('.resource-text').waitFor();
    assert((await p.locator('.resource-text').innerText()).includes('每天留出十分钟'));
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.screenshot({ animations: 'disabled', path: `${output}/reader-${width}-${theme}.png` });
    await close(p);
    await card.locator('.resource-card').nth(1).click();
    assert.equal(await p.locator('.resource-url').getAttribute('href'), 'https://developer.mozilla.org/zh-CN/');
    await close(p);
    if (width === 390) {
      await p.getByRole('button', { name: '发布内容', exact: true }).click();
      await p.getByRole('button', { name: '分享我的资源', exact: true }).click();
      await p.getByRole('button', { name: /我的知识整理方法/ }).click();
      await p.locator('.snapshot-preview').waitFor();
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await p.screenshot({ animations: 'disabled', path: `${output}/picker-${width}-${theme}.png` });
    }
    await p.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: unsupported candidates filtered, full preview, bookmark + note publish, draft, other-reader, desktop/mobile light/dark. Post: ' +
      postId,
  );
} catch (error) {
  for (const [i, p] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries()) {
    await p.screenshot({ animations: 'disabled', path: `${output}/failure-${i}.png` }).catch(() => {});
    console.log((await p.locator('body').innerText()).slice(-1800));
  }
  throw error;
} finally {
  await browser.close();
}

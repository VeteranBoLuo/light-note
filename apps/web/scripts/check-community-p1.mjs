import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const screenshot = async (page, name) => {
  if (process.env.LIGHTNOTE_SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.LIGHTNOTE_SCREENSHOT_DIR}/${name}.png` });
};
const go = (page, path) => page.evaluate((path) => window.communityFixture.router.push(path), path);
try {
  for (const width of [1440, 390, 360])
    for (const theme of ['day', 'night']) {
      const mobile = width < 768,
        name = `${width}-${theme}`;
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
      const base = `${origin}/e2e/community-p1.html?theme=${theme}${mobile ? '&renderProfile=mobile' : ''}`;
      await page.goto(base);
      await page.waitForSelector('.community-message');
      await page.waitForFunction(() => window.communityFixture.active.value);
      assert.equal(
        await page.evaluate(() => window.communityFixture.router.currentRoute.value.path),
        '/community/chat',
      );
      await page.locator('.community-composer textarea').fill('切换页面保留的草稿');
      await page.waitForTimeout(600);
      await page.locator('.community-message-list').hover();
      await page.locator('.community-message-list').evaluate(el => {
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: -2000, bubbles: true }));
        el.scrollTop = Math.max(0, el.scrollTop - 2000);
        el.dispatchEvent(new Event('scroll'));
      });
      await page.waitForTimeout(300);
      const anchor = await page.locator('.community-message-list').evaluate((el) => {
        const top = el.getBoundingClientRect().top;
        const item = [...el.querySelectorAll('[data-message-public-id]')].find(
          (item) => item.getBoundingClientRect().bottom >= top - 1,
        );
        return { id: item.dataset.messagePublicId, offset: item.getBoundingClientRect().top - top };
      });
      await screenshot(page, `${name}-chat`);
      await go(page, '/preferences');
      await page.waitForSelector('.community-preferences');
      assert.equal(await page.evaluate(() => window.communityFixture.active.value), false);
      await page.getByRole('button', { name: '聊天室', exact: true }).click();
      await page.waitForFunction(() =>
        window.communityFixture.calls.some((c) => c.method === 'put' && c.url.includes('/community/preferences')),
      );
      assert.ok(await page.getByRole('button', { name: '广场（暂未开放）', exact: true }).isDisabled());
      await page.evaluate(() =>
        window.communityFixture.unread.syncDirectory({
          messagingEnabled: true,
          items: [{ slug: 'general', unreadCount: 108, mentionCount: 0 }],
        }),
      );
      if (!mobile) assert.equal(await page.locator('.navigation-community-entry__badge').innerText(), '99+');
      await screenshot(page, `${name}-preferences`);
      await go(page, '/community/chat');
      await page.waitForSelector('.community-message');
      assert.equal(await page.locator('.community-composer textarea').inputValue(), '切换页面保留的草稿');
      await page.waitForFunction((id) => window.communityFixture.calls.some((c) => c.params?.focus === id), anchor.id);
      await page.waitForTimeout(200);
      const offset = await page
        .locator(`[data-message-public-id="${anchor.id}"]`)
        .evaluate(
          (el) => el.getBoundingClientRect().top - el.closest('.community-message-list').getBoundingClientRect().top,
        );
      assert.ok(Math.abs(offset - anchor.offset) < 3, `Reading anchor restored: ${offset} / ${anchor.offset}`);
      await go(page, '/community-chat?room=general&message=message-3');
      await page.waitForFunction(() => window.communityFixture.calls.some((c) => c.params?.focus === 'message-3'));
      assert.equal(
        await page.evaluate(() => window.communityFixture.router.currentRoute.value.query.message),
        'message-3',
      );
      await go(page, '/community/profile');
      await page.waitForSelector('.chat-profile-content__identity');
      await screenshot(page, `${name}-profile`);
      await page.getByRole('button', { name: '编辑名片', exact: true }).click();
      await page.locator('.chat-profile-content textarea').fill('从个人中心更新的简介');
      await page.evaluate(() => (window.communityFixture.control.failProfileSave = true));
      await page.getByRole('button', { name: '保存名片', exact: true }).click();
      await page.waitForFunction(() => document.body.innerText.includes('资料未保存'));
      assert.equal(await page.locator('.chat-profile-content textarea').inputValue(), '从个人中心更新的简介');
      await screenshot(page, `${name}-profile-error`);
      await page.evaluate(() => (window.communityFixture.control.failProfileSave = false));
      await page.getByRole('button', { name: '保存名片', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.chat-profile-content textarea'));
      assert.ok((await page.locator('.chat-profile-content').innerText()).includes('从个人中心更新的简介'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await go(page, '/settings?section=community');
      await page.waitForSelector('.settings-page .community-preferences');
      await screenshot(page, `${name}-settings`);
      await page.getByRole('button', { name: '社区公开资料', exact: true }).click();
      await page.waitForSelector('.community-own-profile');
      await go(page, '/community/chat');
      await page.waitForSelector('.community-message');
      await page.getByRole('button', { name: '聊天设置', exact: true }).click();
      await page.waitForSelector('.chat-settings-modal .community-preferences');
      await page.waitForTimeout(450);
      await screenshot(page, `${name}-chat-settings`);
      await page.goto(`${base}&path=/preferences&error`);
      await page.waitForSelector('.community-preferences__error');
      await screenshot(page, `${name}-preferences-error`);
      await page.evaluate(() => (window.communityFixture.control.failPreferences = false));
      await page.locator('.community-preferences__error button').click();
      await page.waitForFunction(() => !document.querySelector('.community-preferences__error'));
      await page.goto(`${base}&path=/community/profile&guest`);
      await page.waitForFunction(() => document.body.innerText.includes('请使用自己的登录账号'));
      assert.equal(await page.locator('.chat-profile-content').count(), 0);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${name}: navigation, preference retry, badge, draft/anchor, deep link, profile save/failure, guest`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}

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
const notificationMessage = '[data-message-public-id="message-34"]';
const chatNotice = '[data-notification-id="chat-emoji-notice"]';
const todoNotice = '[data-notification-id="unrelated-todo-notice"]';
const viewports = [
  { width: 1440, density: 'medium' },
  { width: 1440, density: 'small' },
  { width: 1440, density: 'large' },
  { width: 390, density: 'medium' },
  { width: 360, density: 'medium' },
];

async function scrollAwayFromNotice(page) {
  await page.locator('.community-message-list').evaluate((container) => {
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: -2000, bubbles: true }));
    container.scrollTop = 0;
    container.dispatchEvent(new Event('scroll'));
  });
  const targetIsBelowViewport = await page.locator(notificationMessage).evaluate((target) =>
    target.getBoundingClientRect().top >= target.closest('.community-message-list').getBoundingClientRect().bottom,
  );
  assert.ok(targetIsBelowViewport, 'Test requires the message to start outside the chat viewport');
}

async function expectNoticeMessageInView(page) {
  await page.waitForFunction((selector) => {
    const target = document.querySelector(selector);
    const viewport = target?.closest('.community-message-list').getBoundingClientRect();
    const message = target?.getBoundingClientRect();
    return target?.classList.contains('is-focused') && message.top >= viewport.top && message.bottom <= viewport.bottom;
  }, notificationMessage);
  assert.match(await page.locator(notificationMessage).innerText(), /😁/u);
}

async function checkChatNotification(page, mobile, name) {
  const openNotifications = async () => {
    if (mobile) await go(page, '/notifications');
    else await page.locator('.nt-bell').click();
    await page.locator(chatNotice).waitFor();
    if (!mobile) {
      await page.waitForFunction(() => {
        const panel = document.querySelector('.notification-popover');
        return panel && Number(getComputedStyle(panel).opacity) >= 0.99;
      });
    }
  };

  await scrollAwayFromNotice(page);
  await openNotifications();
  assert.equal(await page.locator(`${chatNotice} .nt-item-content`).innerText(), '薄荷：😁');
  await screenshot(page, `${name}-chat-notification`);
  await page.locator(chatNotice).click();
  await expectNoticeMessageInView(page);
  await screenshot(page, `${name}-chat-notification-target`);

  await scrollAwayFromNotice(page);
  await openNotifications();
  assert.equal(await page.locator(`${chatNotice}.unread`).count(), 0);
  assert.equal(await page.locator(`${todoNotice}.unread`).count(), 1);
  if (!mobile) assert.equal(await page.locator('.nt-badge').innerText(), '1');
  await page.locator(chatNotice).click();
  await expectNoticeMessageInView(page);

  const writes = await page.evaluate(() => window.communityFixture.calls
    .filter(({ url }) => url.endsWith('/notification/markRead'))
    .map(({ data }) => data.ids));
  assert.deepEqual(writes, [['chat-emoji-notice']]);
}

try {
  for (const { width, density } of viewports)
    for (const theme of ['day', 'night']) {
      const mobile = width < 768,
        name = `${width}-${theme}${density === 'medium' ? '' : `-${density}`}`;
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
      const base = `${origin}/e2e/community-p1.html?chatNotification=1&theme=${theme}&density=${density}${mobile ? '&renderProfile=mobile' : ''}`;
      await page.goto(base);
      await page.waitForSelector('.community-message');
      assert.equal(
        await page.locator('html').getAttribute('data-density'),
        { small: 'compact', medium: 'standard', large: 'comfortable' }[density],
      );
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
      await go(page, '/settings');
      assert.equal(await page.evaluate(() => window.communityFixture.active.value), false);
      await page.evaluate(() =>
        window.communityFixture.unread.syncDirectory({
          messagingEnabled: true,
          items: [{ slug: 'general', unreadCount: 108, mentionCount: 0 }],
        }),
      );
      if (!mobile) assert.equal(await page.locator('.navigation-community-entry__badge').innerText(), '99+');
      await screenshot(page, `${name}-settings`);
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
      await checkChatNotification(page, mobile, name);
      await go(page, '/community/profile');
      await page.waitForSelector('.chat-profile-content__identity');
      await screenshot(page, `${name}-profile`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${name}: navigation, badge, draft/anchor, chat notification, profile`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}

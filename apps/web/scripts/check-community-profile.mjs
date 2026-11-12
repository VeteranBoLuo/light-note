import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://127.0.0.1:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local Vite server');
const output = process.env.LIGHTNOTE_PROFILE_SCREENSHOTS || path.join(os.tmpdir(), 'lightnote-community-profile');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [];
let scenarios = 0;
let current;
const heights = {};

async function open({
  width = 1440,
  state = 'member',
  theme = 'day',
  density = 'medium',
  locale = 'zh-CN',
  art = 'background_coast',
} = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  current = page;
  page.setDefaultTimeout(12_000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) =>
    new URL(route.request().url()).pathname.startsWith('/api/') ? route.abort() : route.continue(),
  );
  const params = new URLSearchParams({ state, theme, density, locale, art });
  if (width < 768) params.set('renderProfile', 'mobile');
  await page.goto(`${origin}/e2e/community-profile.html?${params}`);
  await page.locator('.chat-profile-content--card').waitFor();
  await page.waitForFunction(() => {
    const modal = document.querySelector('.modal-view');
    const drawer = document.querySelector('.b-drawer-wrapper');
    return modal ? getComputedStyle(modal).opacity === '1' : drawer?.classList.contains('is-settled');
  });
  scenarios++;
  return page;
}

async function verifyLayout(page, { width, state }) {
  const result = await page.locator('.chat-profile-content--card').evaluate((el) => {
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    const identity = el.querySelector('.chat-profile-content__identity');
    const copy = el.querySelector('.chat-profile-content__identity-copy');
    const tags = [...el.querySelector('.chat-profile-content__identity-tags').children];
    const tenure = el.querySelector('.chat-profile-content__identity .chat-profile-content__tenure');
    const avatar = el.querySelector('.chat-profile-content__avatar');
    const chipStyle = getComputedStyle(el.querySelector('.growth-level-chip'));
    const color = (cssColor) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      context.fillStyle = cssColor;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data]
        .slice(0, 3)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const foreground = color(chipStyle.color),
      background = color(chipStyle.backgroundColor);
    return {
      content: box(el),
      identity: box(identity),
      copy: box(copy),
      tags: tags.map(box),
      tenure: box(tenure),
      avatar: box(avatar),
      toolbar: box(el.querySelector('.chat-profile-content__toolbar')),
      achievements: [...el.querySelectorAll('.chat-profile-content__achievement')].map(box),
      overflow: el.scrollWidth - el.clientWidth,
      density: document.documentElement.dataset.density,
      ellipsis: getComputedStyle(copy.querySelector('strong')).textOverflow,
      levelContrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
    };
  });
  assert(result.overflow <= 1, `${state}/${width}: horizontal overflow`);
  assert(result.levelContrast >= 4.5, `${state}/${width}: level text contrast ${result.levelContrast}`);
  assert.equal(
    result.tags.length,
    ['own', 'moderator'].includes(state) ? 3 : ['framed', 'long', 'decorated'].includes(state) ? 2 : 1,
  );
  assert(
    result.tenure.top >= Math.max(...result.tags.map((tag) => tag.bottom)),
    'Tenure must follow the entire tag group',
  );
  assert(result.tenure.bottom <= result.identity.bottom, 'Tenure must remain inside the identity surface');
  assert(result.toolbar.top >= result.identity.bottom, 'Actions must follow the identity surface');
  assert(result.avatar.right <= result.copy.left, 'Avatar frame must reserve its full width');
  for (const tag of result.tags) assert(tag.right <= result.copy.right + 1, 'Tag label must fit the text column');
  if (width < 768) {
    assert.equal(result.density, 'standard', 'Mobile must ignore desktop density preferences');
    for (let i = 1; i < result.achievements.length; i++)
      assert(result.achievements[i].top >= result.achievements[i - 1].bottom, 'Mobile achievements use one column');
  } else {
    assert(
      result.achievements.every((item) => Math.abs(item.top - result.achievements[0].top) <= 1),
      'Featured achievements fit one row',
    );
  }
  if (state === 'long') assert.equal(result.ellipsis, 'ellipsis');
  if (state === 'own' && !page.url().includes('locale=en-US')) {
    const tops = await page
      .locator('.chat-profile-content__toolbar button')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
    assert(Math.max(...tops) - Math.min(...tops) <= 1, 'The short owner actions fit one aligned row');
  }
  return result;
}

try {
  for (const theme of process.env.LIGHTNOTE_PROFILE_LAYOUT === 'skip' ? [] : ['day', 'night']) {
    for (const density of ['small', 'medium', 'large']) {
      for (const state of ['member', 'framed', 'moderator', 'own', 'long']) {
        const page = await open({ theme, density, state });
        const geometry = await verifyLayout(page, { width: 1440, state });
        if (state === 'own') {
          heights[`${theme}-${density}`] = geometry.content.height;
          await page.locator('.modal-view').screenshot({ path: path.join(output, `desktop-${theme}-${density}.png`) });
        }
        await page.close();
      }
    }
    for (const width of [320, 390]) {
      for (const state of ['member', 'framed', 'moderator', 'own', 'long']) {
        const page = await open({ theme, width, state, density: 'large' });
        await verifyLayout(page, { width, state });
        const privacy = page.getByRole('button', { name: '查看范围', exact: true });
        await privacy.scrollIntoViewIfNeeded();
        assert(await privacy.isVisible(), 'Drawer footer must remain reachable');
        if (['own', 'long'].includes(state)) {
          await page.locator('.b-drawer-body').evaluate((el) => {
            el.scrollTop = 0;
          });
          await page.screenshot({ path: path.join(output, `mobile-${width}-${theme}-${state}.png`) });
        }
        await page.close();
      }
    }
    assert(heights[`${theme}-small`] < heights[`${theme}-medium`], 'Compact density must reduce vertical occupation');
    assert(heights[`${theme}-medium`] < heights[`${theme}-large`], 'Comfortable density must increase dimensions');
    for (const width of [1440, 320]) {
      const page = await open({ theme, width, state: 'own', art: 'background_stars' });
      await verifyLayout(page, { width, state: 'own' });
      await page.screenshot({ path: path.join(output, `night-art-${theme}-${width}.png`) });
      await page.close();
    }
  }

  for (const width of [1440, 320]) {
    for (const state of ['own', 'long']) {
      const page = await open({ width, state, theme: 'night', locale: 'en-US' });
      await verifyLayout(page, { width, state });
      await page.screenshot({ path: path.join(output, `english-${width}-${state}.png`) });
      await page.close();
    }

    let page = await open({ width });
    const more = page.getByRole('button', { name: '更多成员操作', exact: true });
    assert.equal(await page.getByRole('menu').count(), 0);
    await more.click();
    await page.getByRole('menu').waitFor();
    await page.getByRole('menuitem').first().waitFor();
    assert.equal(await page.getByRole('menuitem').count(), 2);
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({ state: 'hidden' });
    assert(
      await page.locator('.chat-profile-content--card').isVisible(),
      'Escape from menu must keep the profile open',
    );
    await more.click();
    await page.getByRole('menuitem', { name: '屏蔽该成员', exact: true }).click();
    await page.locator('output').filter({ hasText: 'block' }).waitFor();
    await page.getByRole('button', { name: '重新打开名片', exact: true }).click();
    await page.getByRole('button', { name: '关注', exact: true }).click();
    await page.getByRole('button', { name: '取消关注', exact: true }).waitFor();
    await page.getByRole('button', { name: '查看范围', exact: true }).click();
    assert.equal(
      await page.getByRole('button', { name: '收起说明', exact: true }).getAttribute('aria-expanded'),
      'true',
    );
    assert(await page.getByText('这里只展示昵称', { exact: false }).isVisible());
    await page.getByRole('button', { name: '查看全部 10 项成就', exact: true }).click();
    await page.getByRole('button', { name: '返回名片', exact: true }).click();
    await page.getByRole('button', { name: '公开主页', exact: true }).click();
    await page.locator('output').filter({ hasText: 'navigate:/community/people/profile-fixture' }).waitFor();
    await page.close();

    page = await open({ width, state: 'official' });
    await page.getByRole('button', { name: '更多成员操作', exact: true }).click();
    await page.getByRole('menu').waitFor();
    await page.getByRole('menuitem').first().waitFor();
    assert.equal(await page.getByRole('menuitem').count(), 1);
    await page.getByRole('menuitem', { name: '举报这条消息', exact: true }).click();
    await page.locator('output').filter({ hasText: 'report' }).waitFor();
    await page.close();

    page = await open({ width, state: 'own' });
    await page.getByRole('button', { name: '编辑社区资料', exact: true }).click();
    await page.locator('output').filter({ hasText: 'navigate:/community/profile' }).waitFor();
    await page.close();

    for (const state of ['loading', 'error', 'empty', 'visitor', 'achievements-error', 'achievements-loading']) {
      page = await open({ width, state });
      if (state === 'loading') assert(await page.getByText('正在读取公开资料', { exact: true }).isVisible());
      if (state === 'error') {
        await page.getByRole('button', { name: '重新读取', exact: true }).click();
        await page.locator('.chat-profile-content__identity').waitFor();
      }
      if (state === 'empty') assert.equal(await page.locator('.chat-profile-content__achievement').count(), 0);
      if (state === 'visitor') {
        assert.equal(await page.getByRole('button', { name: '更多成员操作', exact: true }).count(), 0);
        await page.getByRole('button', { name: '登录 / 注册后参与', exact: true }).click();
        await page.locator('output').filter({ hasText: 'login' }).waitFor();
      }
      if (state.startsWith('achievements-')) {
        await page.getByRole('button', { name: '查看全部 10 项成就', exact: true }).click();
        if (state.endsWith('error'))
          assert(await page.getByRole('button', { name: '重新读取', exact: true }).isVisible());
        else assert(await page.getByText('正在读取全部成就', { exact: true }).isVisible());
        await page.getByRole('button', { name: '返回名片', exact: true }).click();
      }
      await page.screenshot({ path: path.join(output, `state-${width}-${state}.png`) });
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(JSON.stringify({ scenarios, heights, screenshots: output }));
} catch (error) {
  if (current && !current.isClosed()) {
    console.error('Failed URL:', current.url());
    console.error('Browser errors:', errors);
    await current.screenshot({ path: path.join(output, 'failure.png') });
  }
  throw error;
} finally {
  await browser.close();
}

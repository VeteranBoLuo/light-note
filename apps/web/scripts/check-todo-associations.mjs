import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const context = await browser.newContext({ serviceWorkers: 'block' });
const list = { id: 'development', name: '开发', color: '#6554ed', pendingTotal: 1, completedTotal: 0 };
const rows = [
  { id: 'linked', title: '检查本次发布文案', listId: list.id, list },
  { id: 'free', title: '整理本周资料', listId: null },
  { id: 'other', title: '来自其他清单的待办', listId: 'other', list: { id: 'other', name: '其他清单' } },
].map((item) => ({
  ...item,
  status: 'pending',
  priority: item.id === 'linked' ? 2 : 1,
  description: item.id === 'linked' ? '核对发布范围与验收结果，补齐团队需要的说明。' : '',
  tags: [{ id: 'tag1', name: '日常' }, { id: 'tag2', name: '发布准备' }],
  checklist: [{ id: 'c1', text: '核对', done: true }, { id: 'c2', text: '确认', done: false }],
  seriesId: item.id === 'free' ? 'series1' : null,
  occurrenceNo: 2,
  startAt: '2026-09-09 09:00:00',
  createdAt: '2026-09-09',
  updatedAt: '2026-09-09',
  dueAt: '2026-09-12 10:00:00',
}));
let fail = false;
const writes = [],
  errors = [];
await context.routeWebSocket('**/*', (ws) => ws.close());
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  let q = {};
  try {
    q = route.request().postDataJSON() || {};
  } catch {}
  let data = {},
    status = 200;
  if (url.pathname === '/api/user/me')
    data = {
      id: 'fixture-owner',
      userName: 'fixture',
      alias: '测试用户',
      role: 'user',
      preferences: { todoView: 'list', theme: 'day', lang: 'zh-CN', uiScale: 'medium' },
    };
  else if (url.pathname === '/api/todo/lists') data = { items: [list] };
  else if (url.pathname === '/api/bookmark/queryTagList') data = [];
  else if (url.pathname === '/api/todo/workspace') {
    const items = rows.filter(
      (item) => (q.listId === undefined || q.listId === item.listId) && (!q.keyword || item.title.includes(q.keyword)),
    );
    data = {
      items: q.presentation ? [] : items,
      nextCursor: null,
      lists: [list],
      groups: [{ key: 'unassigned', instanceCount: 3, nodeCount: 3 }],
      statusTotals: { pending: 3, completed: 0, all: 3 },
      overview: { allTotal: 3, scheduled: 3 },
      navigationCounts: { pending: { allTotal: 3, unassigned: 2 }, completed: {} },
    };
  } else if (url.pathname === '/api/todo/workspace/group')
    data = { nodes: rows.map((item) => ({ kind: 'item', key: item.id, item })), total: 3, nextCursor: null };
  else if (url.pathname === '/api/todo/organization') {
    writes.push(q);
    if (fail) {
      fail = false;
      status = 500;
    } else
      for (const row of rows)
        if (q.ids.includes(row.id)) {
          row.listId = q.listId;
          row.list = q.listId ? list : null;
        }
  } else if (/query.*List|\/list$/.test(url.pathname)) data = [];
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status, data, msg: '' }),
  });
});
await fs.mkdir('/tmp/ln-todo-associations', { recursive: true });
for (const width of [1440, 390])
  for (const theme of ['day', 'night']) {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 950 });
    await page.goto('http://localhost:5173/inbox?tab=todo' + (width < 768 ? '&renderProfile=mobile' : ''));
    await page.locator('.todo-item').first().waitFor();
    await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
    if (width < 768) {
      const trigger = page.locator('.mobile-todo-heading__scope');
      if (await trigger.count()) await trigger.click();
      else
        await page
          .getByRole('button', { name: /选择范围/ })
          .first()
          .click();
    }
    const side = page.locator('.todo-workspace-sidebar').filter({ visible: true });
    const title = side.locator('.todo-workspace-sidebar__list-title').first();
    await title.waitFor();
    if (width > 768) {
      assert.equal(await side.locator('.todo-workspace-sidebar__mobile-more').count(), 0);
      await title.hover();
      await page.getByRole('menuitem', { name: '管理关联', exact: true }).waitFor();
      await page.screenshot({ path: `/tmp/ln-todo-associations/menu-${width}-${theme}.png` });
      await page.keyboard.press('Escape');
      await title.click({ button: 'right' });
    } else await side.locator('.todo-workspace-sidebar__mobile-more').first().click();
    await page.getByRole('menuitem', { name: '管理关联', exact: true }).click();
    await page.locator('.todo-list-associations').waitFor();
    await page.getByRole('tab', { name: '全部待办', exact: true }).click();
    await page.waitForTimeout(350);
    const target = page.locator('.todo-list-associations__row').filter({ hasText: '整理本周资料' });
    if (width === 1440 && theme === 'day') {
      fail = true;
      await target.getByRole('button', { name: '关联', exact: true }).click();
      await page.waitForTimeout(150);
      assert((await target.count()) === 1, 'failure keeps row');
      await target.getByRole('button', { name: '关联', exact: true }).click();
      await page.waitForTimeout(150);
      await target.getByRole('button', { name: '取消关联', exact: true }).click();
      await page.waitForTimeout(150);
      assert.deepEqual(
        writes.slice(-2).map((q) => [q.ids, q.scope, q.listId]),
        [
          [['free'], 'current', 'development'],
          [['free'], 'current', null],
        ],
      );
    }
    assert(await page.locator('.todo-list-associations').getByText('发布准备', { exact: true }).count());
    assert(await target.getByText('重复 · 第 2 次', { exact: true }).count());
    await page.screenshot({ path: `/tmp/ln-todo-associations/manage-${width}-${theme}.png` });
    const search = page.locator('.todo-list-associations input');
    await search.fill('本周');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.todo-list-associations__row').count(), 1);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await page.close();
  }
assert.deepEqual(errors, []);
console.log(JSON.stringify({ errors, writes, viewports: [1440, 390], themes: ['day', 'night'] }));
await browser.close();

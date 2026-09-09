/** Real-route browser regression with fully intercepted API fixtures. No live backend or stored account is used. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
let page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const requests = [];
const makeItem = (id, seriesId) => ({
  id,
  title: seriesId ? '数据分析系统学习' : '独立任务 ' + id,
  description: '准备数据分析师认证',
  priority: 2,
  status: 'pending',
  checklist: [
    { id: 'c1', text: '阅读本次资料', done: false },
    { id: 'c2', text: '完成练习', done: false },
  ],
  seriesId,
  planVersion: 2,
  occurrenceDate: '2026-09-09',
  dueAt: '2026-09-09 22:00:00',
  createdAt: '2026-09-01 00:00:00',
  updatedAt: '2026-09-01 00:00:00',
  listId: null,
  tags: [],
  series: seriesId
    ? {
        id: seriesId,
        repeatMode: 'scheduled',
        status: 'active',
        timezone: 'Asia/Shanghai',
        version: 1,
        plan: { frequency: 'daily', interval: 1 },
        progress: { completed: 0, generated: 114, total: null },
      }
    : null,
});
let representative = makeItem('today', 'series-a');
const groups = [
  { key: 'focus', nodeCount: 66, instanceCount: 179 },
  { key: 'unassigned', nodeCount: 1, instanceCount: 1 },
];
let failNext = false;
const deletedOccurrences = new Set();
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  let q = {};
  try {
    q = route.request().postDataJSON() || {};
  } catch {}
  requests.push([url.pathname, q]);
  let data = {};
  let status = 200;
  if (url.pathname === '/api/user/me')
    data = {
      id: 'fixture-owner',
      userName: 'fixture',
      alias: '测试用户',
      role: 'user',
      preferences: { todoView: 'list', theme: 'day', lang: 'zh-CN', uiScale: 'medium' },
    };
  else if (url.pathname === '/api/bookmark/queryTagList') data = [];
  else if (url.pathname === '/api/todo/lists') data = { items: [] };
  else if (/\/v2\/(update-)?preview$/.test(url.pathname))
    data = {
      previewHash: 'fixture-preview',
      occurrenceCount: 1,
      generatedNowCount: 1,
      reminderJobCount: 0,
      requiredChoices: [],
      occurrences: [],
      displaySummary: {
        title: '将创建 1 条待办',
        range: '2026-09-09',
        timing: '09:00 开始 · 11:00 截止',
        reminder: '不提醒',
      },
    };
  else if (url.pathname === '/api/todo/workspace')
    data = q.presentation
      ? {
          groups,
          items: [],
          lists: [],
          statusTotals: { pending: 180, completed: 5, all: 185 },
          overview: { allTotal: 180, important: 179, scheduled: 180, overdue: 3, today: 1, week: 2 },
          navigationCounts: { pending: { allTotal: 180, important: 179, unassigned: 180 }, completed: { allTotal: 5 } },
          groupCounts: { focus: 179, unassigned: 1 },
        }
      : { items: [{ ...makeItem('completed'), status: 'completed' }] };
  else if (url.pathname === '/api/todo/workspace/group') {
    if (failNext && q.cursor) {
      status = 500;
      failNext = false;
      data = {};
    } else {
      const all =
        q.groupKey === 'focus'
          ? [
              {
                kind: 'series',
                key: 'series:a',
                seriesId: 'series-a',
                representative,
                instanceCount: 114,
                overdueCount: 3,
                futureCount: 110,
              },
              ...Array.from({ length: 65 }, (_, i) => ({
                kind: 'item',
                key: 'todo:' + i,
                item: makeItem('single-' + i),
              })),
            ]
          : [{ kind: 'item', key: 'todo:normal', item: { ...makeItem('normal'), priority: 0 } }];
      const offset = Number(q.cursor || 0);
      data = {
        nodes: all.slice(offset, offset + 30),
        nextCursor: offset + 30 < all.length ? String(offset + 30) : null,
        total: all.length,
      };
    }
  } else if (url.pathname === '/api/todo/workspace/series') {
    const offset = Number(q.cursor || 0);
    const all = Array.from({ length: 114 }, (_, i) => ({
      ...makeItem('occurrence-' + i, 'series-a'),
      title: '数据分析系统学习 · 第 ' + (i + 1) + ' 次',
      status: q.status || 'pending',
    })).filter((item) => !deletedOccurrences.has(item.id));
    data = {
      items: all.slice(offset, offset + 30),
      total: 114,
      nextCursor: offset + 30 < all.length ? String(offset + 30) : null,
    };
  } else if (url.pathname === '/api/todo/v2/delete') {
    deletedOccurrences.add(q.id || q.todoId);
    data = { affected: 1 };
  } else if (url.pathname === '/api/todo/complete') {
    representative = makeItem('tomorrow', 'series-a');
    data = { affected: 1 };
  } else if (url.pathname === '/api/inbox/count' || url.pathname === '/api/todo/count')
    data = { todoPendingTotal: 180, pendingTotal: 180, total: 180 };
  else if (/query.*List|\/list$/.test(url.pathname)) data = [];
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status, data, msg: '' }),
  });
});
await context.routeWebSocket('**/*', (ws) => ws.close());
await page.goto('http://localhost:5173/inbox?tab=todo');
await page.waitForTimeout(2000);
await fs.mkdir('/tmp/ln-todo-visual', { recursive: true });

const measurements = [];
await page.locator('.todo-series-group__view').first().waitFor();
await page.waitForTimeout(300);
assert.equal(await page.locator('.inbox-scroll').evaluate((el) => el.scrollTop), 0, 'first page stays at top');
const border = await page
  .locator('.todo-series-group .todo-item')
  .first()
  .evaluate((el) => getComputedStyle(el).borderBottomWidth);
assert.equal(border, '0px', 'series body and metadata are one item');
assert((await page.locator('.todo-group__items .todo-item').count()) < 25, 'only nearby rows are rendered');

await page
  .locator('.todo-series-group .todo-subitems')
  .first()
  .click({ position: { x: 200, y: 10 } });
await page.locator('.todo-preview__edit').waitFor();
await page.locator('.todo-preview__edit').click();
await page.locator('.todo-simple-editor .todo-checklist-editor').waitFor();
await page.waitForTimeout(500);
const previewContent = page.locator('.todo-simple-editor__preview');
const previewBefore = await previewContent.boundingBox();
await page.locator('.todo-simple-editor__main').evaluate((el) => {
  el.scrollTop = 450;
});
await page.waitForTimeout(250);
const previewAfter = await previewContent.boundingBox();
assert(Math.abs(previewAfter.y - previewBefore.y) < 3, 'editing preview remains fixed while form scrolls');
await page.screenshot({ path: '/tmp/ln-todo-visual/editor-sticky.png' });
await page.locator('.todo-simple-editor .todo-checklist-editor').scrollIntoViewIfNeeded();
await page.screenshot({ path: '/tmp/ln-todo-visual/editor-checklist.png' });
// Re-enter the route so the remaining fixture scenarios are independent of editor overlay history.
await page.goto('http://localhost:5173/inbox?tab=todo');
await page.locator('.todo-series-group__view').first().waitFor();
await page.waitForTimeout(300);

const before = await page.locator('.todo-group__items .b-virtual-list__item').nth(1).boundingBox();
await page
  .locator('.todo-series-group')
  .first()
  .getByRole('button', { name: /子事项/ })
  .click();
await page.waitForTimeout(250);
const after = await page.locator('.todo-group__items .b-virtual-list__item').nth(1).boundingBox();
assert(after.y > before.y, 'expanded checklist increases measured row height');
await page.screenshot({ path: '/tmp/ln-todo-visual/desktop-expanded.png' });
await page.locator('.todo-series-group__view').first().click();
await page.locator('.b-drawer-panel .todo-item').first().waitFor();
await page.waitForTimeout(400);
const drawer = page.locator('.b-drawer-panel').last();
const cards = drawer.locator('.todo-item');
const outer = await drawer.boundingBox(),
  first = await cards.nth(0).boundingBox(),
  second = await cards.nth(1).boundingBox();
assert(first.x - outer.x >= 12, 'drawer horizontal padding');
const deleteColor = await cards
  .first()
  .locator('.todo-occurrence-delete')
  .first()
  .evaluate((el) => getComputedStyle(el).color);
assert.notEqual(
  deleteColor,
  await cards.first().evaluate((el) => getComputedStyle(el).color),
  'delete text uses semantic danger color',
);
assert(second.y - first.y - first.height >= 10, 'drawer card spacing');
assert((await cards.count()) < 25, 'drawer virtualizes occurrences');
await page.screenshot({ path: '/tmp/ln-todo-visual/desktop-drawer.png' });
await cards.first().locator('.todo-item__body').click();
assert.equal(await page.locator('.b-drawer-panel').count(), 1, 'body click does not replace the series drawer');
assert((await drawer.innerText()).includes('系列明细'));
assert.equal(await drawer.locator('.todo-more-button').count(), 0, 'no nested more menus in the series drawer');
await cards.first().getByRole('button', { name: '删除本次', exact: true }).click();
await page.getByRole('button', { name: '取消', exact: true }).last().click();
assert.equal(deletedOccurrences.size, 0, 'cancel must not delete');
await cards.first().getByRole('button', { name: '删除本次', exact: true }).click();
await page.getByRole('button', { name: '删除', exact: true }).last().click();
await page.waitForTimeout(400);
assert.equal(deletedOccurrences.size, 1, 'one occurrence deleted');
assert(
  requests.some(([path, q]) => path.endsWith('/v2/delete') && q.scope === 'current'),
  'delete only the chosen occurrence',
);
assert.equal(await page.locator('.b-drawer-panel').count(), 1, 'deletion preserves the series drawer');
assert.equal(
  await drawer.getByText('数据分析系统学习 · 第 1 次', { exact: true }).count(),
  0,
  'deleted occurrence leaves the current list',
);

await drawer.locator('.b-drawer-body').evaluate((el) => {
  el.scrollTop = el.scrollHeight;
  el.dispatchEvent(new Event('scroll'));
});
await page.waitForTimeout(300);
assert(
  requests.some(([path, q]) => path.endsWith('/workspace/series') && q.cursor),
  'drawer loads next page automatically',
);
await drawer.getByRole('tab', { name: '已完成', exact: true }).click();
await page.waitForTimeout(200);
assert(requests.some(([path, q]) => path.endsWith('/workspace/series') && q.status === 'completed'));
await drawer.locator('.b-drawer-close').click();
await page.waitForTimeout(300);
failNext = true;
await page.locator('.inbox-scroll').evaluate((el) => {
  el.scrollTop = el.scrollHeight;
  el.dispatchEvent(new Event('scroll'));
});
await page.getByRole('button', { name: '加载失败，请重试', exact: true }).waitFor();
const failedRequests = requests.filter(([path, q]) => path.endsWith('/workspace/group') && q.cursor).length;
await page.waitForTimeout(300);
assert.equal(
  requests.filter(([path, q]) => path.endsWith('/workspace/group') && q.cursor).length,
  failedRequests,
  'failure must not loop',
);
await page.screenshot({ path: '/tmp/ln-todo-visual/desktop-retry.png' });
await page.getByRole('button', { name: '加载失败，请重试', exact: true }).click();
await page.waitForTimeout(300);
assert(
  requests.filter(([path, q]) => path.endsWith('/workspace/group') && q.cursor).length > failedRequests,
  'explicit retry resumes',
);
await page.locator('.inbox-scroll').evaluate((el) => {
  el.scrollTop = 0;
  el.dispatchEvent(new Event('scroll'));
});
await page.waitForTimeout(150);
await page.getByRole('button', { name: '批量操作', exact: true }).first().click();
await page.locator('.todo-series-group .todo-item__select').click();
await page.waitForTimeout(100);
assert((await page.locator('.todo-series-group').innerText()).includes('选择仅作用于本次'));
await page.screenshot({ path: '/tmp/ln-todo-visual/desktop-selected.png' });
for (const width of [1440, 390, 320]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('http://localhost:5173/inbox?tab=todo' + (width < 768 ? '&renderProfile=mobile' : ''));
  await page.locator('.todo-series-group__view').first().waitFor();
  await page.waitForTimeout(300);
  for (const theme of ['day', 'night']) {
    await page.close();
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:5173/inbox?tab=todo' + (width < 768 ? '&renderProfile=mobile' : ''));
    await page.locator('.todo-series-group__view').first().waitFor();
    await page.waitForTimeout(350);
    await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
    await page.waitForTimeout(200);
    const series = await page.locator('.todo-series-group').first().boundingBox();
    const text = await page.locator('.todo-series-group__summary').first().boundingBox();
    assert(text.x >= series.x && text.x + text.width <= series.x + series.width + 1, 'metadata fits row');
    const spill = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!spill, 'no horizontal document overflow');
    measurements.push({ width, theme, series, text });
    await page.screenshot({ path: `/tmp/ln-todo-visual/list-${width}-${theme}.png` });
    await page.locator('.todo-series-group__view').first().click();
    await page.locator('.b-drawer-panel .todo-item').first().waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `/tmp/ln-todo-visual/drawer-${width}-${theme}.png` });
    await page.locator('.b-drawer-panel .b-drawer-close').last().click();
    await page.waitForTimeout(650);
    await page.locator('.todo-series-group .todo-item__main-line').first().click();
    await page.locator('.todo-preview__edit').waitFor();
    await page.locator('.todo-preview__edit').click();
    await page.locator('.todo-simple-editor .todo-checklist-editor').waitFor();
    await page.locator('.todo-simple-editor .todo-checklist-editor').scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `/tmp/ln-todo-visual/editor-${width}-${theme}.png` });
    assert((await page.locator('.todo-simple-editor').count()) === 1, 'series editing uses the shared creation form');
    await page.goto('http://localhost:5173/inbox?tab=todo' + (width < 768 ? '&renderProfile=mobile' : ''));
    await page.locator('.todo-series-group__view').first().waitFor();
    await page.waitForTimeout(250);
  }
}
console.log(JSON.stringify({ errors, measurements, requestCount: requests.length }, null, 2));
assert.deepEqual(errors, [], 'no browser exceptions');
await browser.close();

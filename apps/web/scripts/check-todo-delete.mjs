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

await fs.mkdir('/tmp/ln-todo-delete', { recursive: true });
for (const width of [1440, 390, 320])
  for (const theme of ['day', 'night']) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:5173/inbox?tab=todo' + (width < 768 ? '&renderProfile=mobile' : ''));
    await page.locator('.todo-series-group .todo-item__main-line').first().click();
    await page.locator('.todo-preview__delete').click();
    await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
    const alert = page.locator('.bAlert');
    await alert.waitFor();
    await page.waitForTimeout(400);
    assert.equal(await alert.getByRole('radio').count(), 3);
    const indicatorPositions = await alert
      .locator('.b-radio-option__indicator')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
    assert(
      Math.max(...indicatorPositions) - Math.min(...indicatorPositions) < 1,
      'radio indicators share one left edge',
    );
    assert.equal(await alert.getByRole('radio').first().getAttribute('aria-checked'), 'true');
    assert((await alert.textContent()).includes('数据分析系统学习'));
    await page.screenshot({ path: `/tmp/ln-todo-delete/default-${width}-${theme}.png` });
    await alert.getByRole('radio').last().click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `/tmp/ln-todo-delete/series-${width}-${theme}.png` });
    assert.equal(await alert.getByRole('button', { name: '删除整个系列', exact: true }).count(), 1);
    assert.equal(await alert.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
    const before = requests.filter(([path]) => path === '/api/todo/v2/delete').length;
    await alert.getByRole('button', { name: '取消', exact: true }).click();
    await alert.waitFor({ state: 'detached' });
    assert.equal(requests.filter(([path]) => path === '/api/todo/v2/delete').length, before);
    for (const [index, scope] of ['current', 'future', 'series'].entries()) {
      await page.locator('.todo-preview__delete').click();
      await alert.getByRole('radio').nth(index).click();
      await alert.locator('.bAlert-footer .danger_btn, .bAlert-m-footer .is-danger').click();
      await page.waitForTimeout(500);
      assert.equal(requests.filter(([path]) => path === '/api/todo/v2/delete').at(-1)[1].scope, scope);
      if (index < 2) {
        await page.locator('.todo-series-group .todo-item__main-line').first().click();
        await page.locator('.todo-preview__delete').waitFor();
      }
    }
  }
assert.deepEqual(errors, []);
console.log(
  JSON.stringify({
    errors,
    scopes: requests.filter(([path]) => path === '/api/todo/v2/delete').map(([, q]) => q.scope),
  }),
);
await browser.close();

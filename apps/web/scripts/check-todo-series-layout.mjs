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
  reminder: { mode: 'once', channels: ['inApp'], onceAt: '2026-09-09 14:30:00' },
  startAt: '2026-09-09 14:30:00',
  priority: 2,
  status: 'pending',
  checklist: [
    { id: 'c1', text: '阅读本次资料', done: false },
    { id: 'c2', text: '完成练习', done: false },
  ],
  seriesId,
  planVersion: 2,
  occurrenceDate: '2026-09-09',
  dueAt: '2027-01-02 22:00:00',
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
      adminContext: {
        id: 'preview-fixture',
        subjectUserId: 'fixture-owner',
        subjectAlias: '预览用户',
        mode: 'readonly',
        capabilities: [],
        expiresAt: '2099-01-01T00:00:00Z',
      },
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

await fs.mkdir('/tmp/ln-series-layout', { recursive: true });
for (const width of [1440, 390])
  for (const theme of ['day', 'night']) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:5173/inbox?tab=todo' + (width < 768 ? '&renderProfile=mobile' : ''));
    await page.locator('.todo-series-group__view').first().click();
    const cards = page.locator('.todo-series-drawer__pages .todo-item');
    await cards.first().waitFor();
    await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
    await page.waitForTimeout(600);
    assert(await cards.first().locator('.todo-occurrence-delete').first().isDisabled(), 'readonly delete disabled');
    assert(await cards.first().getByRole('checkbox').first().isDisabled(), 'readonly completion disabled');
    await cards.first().locator('.todo-subitems > button').click();
    await page.locator('.todo-series-drawer__pages').evaluate((el) => (el.style.paddingRight = '19px'));
    await page.waitForTimeout(400);
    async function checkLayout() {
      const boxes = await cards.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        }),
      );
      for (let i = 1; i < boxes.length; i++) assert(boxes[i].top >= boxes[i - 1].bottom, 'cards must not overlap');
    }
    await checkLayout();
    await page.screenshot({ path: `/tmp/ln-series-layout/${width}-${theme}.png` });
    await page
      .locator('.b-drawer-body')
      .last()
      .evaluate((el) => (el.scrollTop += 500));
    await page.waitForTimeout(400);
    await checkLayout();
    assert((await cards.count()) < 30, 'rendering remains bounded');
  }
assert.deepEqual(errors, []);
assert(
  !requests.some(([path]) => path === '/api/todo/v2/delete' || path === '/api/todo/complete'),
  'preview issues no writes',
);
console.log(JSON.stringify({ errors, viewports: [1440, 390], themes: ['day', 'night'] }));
await browser.close();

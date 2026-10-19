/** Real-route regression with intercepted fixtures. No account, backend, or external writes are used. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const output = '/tmp/ln-todo-timing';
const capacityOnly = process.argv.includes('--capacity');
const viewFilter = process.argv.find((argument) => argument.startsWith('--view='))?.slice(7);
const views = ['list', 'agenda', 'matrix'].filter((view) => !viewFilter || view === viewFilter);
assert(views.length, 'Unknown todo view');
await fs.mkdir(output, { recursive: true });
const local = (days, hour = 12) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(hour)}:00:00`;
};
const makeItem = (id, extra = {}) => ({
  id,
  title: id,
  description: '',
  checklist: [],
  priority: 1,
  status: 'pending',
  planVersion: 2,
  startAt: null,
  dueAt: null,
  occurrenceDate: null,
  listId: null,
  tags: [],
  resourceRefs: [],
  createdAt: local(-3),
  updatedAt: local(0),
  ...extra,
});
const reminder = (extra = {}) => ({
  version: 1,
  mode: 'once',
  channels: ['in_app'],
  once: { type: 'fixed_at', fixedAt: local(-1) },
  nextAt: local(1, 11),
  ...extra,
});
const pending = [
  makeItem('逾期待处理示例', { dueAt: local(-1), reminder: reminder() }),
  makeItem('跨日任务', { startAt: local(-1, 8), dueAt: local(2, 18), reminder: reminder() }),
  makeItem('全天任务', { occurrenceDate: local(0).slice(0, 10) }),
  makeItem('健身', { dueAt: local(2), reminder: reminder() }),
  makeItem('提醒已过', { dueAt: local(2, 18), reminder: reminder({ nextAt: local(-1) }) }),
  makeItem('暂停提醒', { dueAt: local(3), reminder: reminder({ paused: true }) }),
  makeItem('泡菜', { dueAt: local(18, 13), reminder: reminder({ nextAt: local(18, 11) }) }),
];
const completed = [
  makeItem('最近完成示例', { status: 'completed', dueAt: local(-30), completedAt: local(-1), reminder: reminder() }),
  makeItem('较早完成示例', { status: 'completed', dueAt: local(-20), completedAt: local(-2) }),
];
if (capacityOnly)
  pending.push(
    ...Array.from({ length: 15 }, (_, index) =>
      makeItem(`后续安排 ${index + 1}`, { dueAt: local(20 + index), reminder: reminder() }),
    ),
  );
const counts = {
  lists: [],
  statusTotals: { pending: pending.length, completed: completed.length, all: pending.length + completed.length },
  overview: { allTotal: pending.length, overdue: 1, today: 1, week: 4, scheduled: pending.length, important: 1 },
  navigationCounts: {
    pending: { allTotal: pending.length, unassigned: pending.length },
    completed: { allTotal: completed.length, unassigned: completed.length },
  },
  groupCounts: { unassigned: pending.length },
};
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [];
const reports = [];
const capacities = {};
try {
  for (const width of capacityOnly ? [1440] : [1440, 390, 320]) {
    for (const theme of capacityOnly ? ['day'] : ['day', 'night']) {
      for (const density of width === 1440 ? ['standard', 'compact', 'comfortable'] : ['standard']) {
        for (const view of capacityOnly ? ['list'] : views) {
          const context = await browser.newContext({
            viewport: { width, height: 960 },
            timezoneId: 'Asia/Singapore',
            serviceWorkers: 'block',
          });
          const page = await context.newPage();
          page.on('pageerror', (error) => errors.push(error.message));
          const requests = [];
          await context.route('**/*', async (route) => {
            const url = new URL(route.request().url());
            if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
            if (!url.pathname.startsWith('/api/')) return route.continue();
            let query = {};
            try {
              query = route.request().postDataJSON() || {};
            } catch {}
            requests.push([url.pathname, query]);
            let data = {};
            if (url.pathname === '/api/user/me')
              data = {
                id: 'timing-fixture',
                userName: 'fixture',
                alias: '测试用户',
                role: 'user',
                adminContext: {
                  id: 'timing-preview',
                  subjectUserId: 'timing-fixture',
                  mode: 'readonly',
                  capabilities: [],
                  expiresAt: '2099-01-01T00:00:00Z',
                },
                preferences: {
                  todoView: view,
                  theme,
                  lang: 'zh-CN',
                  uiScale: density === 'compact' ? 'small' : density === 'comfortable' ? 'large' : 'medium',
                },
              };
            else if (url.pathname === '/api/bookmark/queryTagList') data = [];
            else if (url.pathname === '/api/todo/lists') data = { items: [] };
            else if (url.pathname === '/api/todo/workspace') {
              if (query.presentation === 'series')
                data = {
                  ...counts,
                  groups: [{ key: 'unassigned', nodeCount: pending.length, instanceCount: pending.length }],
                  items: [],
                  nextCursor: null,
                };
              else if (query.presentation === 'agenda') {
                const all = [...pending, ...completed];
                const offset = Number(query.cursor || 0);
                const size = offset ? all.length : 4;
                data = {
                  ...counts,
                  items: all.slice(offset, offset + size),
                  total: all.length,
                  nextCursor: offset ? null : '4',
                };
              } else
                data = {
                  ...counts,
                  items: query.status === 'completed' ? completed : pending,
                  total: pending.length,
                  nextCursor: null,
                };
            } else if (url.pathname === '/api/todo/workspace/group')
              data = {
                nodes: pending.map((item) => ({ kind: 'item', key: `todo:${item.id}`, item })),
                nextCursor: null,
                total: pending.length,
              };
            else if (url.pathname === '/api/inbox/count' || url.pathname === '/api/todo/count')
              data = { todoPendingTotal: pending.length, pendingTotal: pending.length, total: pending.length };
            else if (/query.*List|\/list$/.test(url.pathname)) data = [];
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ status: 200, data, msg: '' }),
            });
          });
          await context.routeWebSocket('**/*', (socket) => socket.close());
          await page.goto(`http://localhost:5173/inbox?tab=todo${width < 768 ? '&renderProfile=mobile' : ''}`);
          if (view === 'agenda') {
            await page.locator('.todo-agenda-group').first().waitFor();
            assert(requests.some(([path, query]) => path === '/api/todo/workspace' && query.presentation === 'agenda'));
            await page.getByRole('button', { name: '加载更多', exact: true }).click();
            await page.locator('.todo-agenda-group__history').waitFor();
            if (width < 768)
              assert(
                (await page.locator('.todo-agenda-group__history').boundingBox()).height >= 32,
                'history has a usable touch target',
              );
            assert(
              requests.some(
                ([path, query]) =>
                  path === '/api/todo/workspace' && query.presentation === 'agenda' && query.cursor === '4',
              ),
            );
            assert.deepEqual(
              await page
                .locator('[data-agenda-group]')
                .evaluateAll((nodes) => nodes.map((node) => node.dataset.agendaGroup)),
              ['overdue', 'today', 'upcoming', 'completed'],
            );
            assert.equal(await page.locator('[data-agenda-group="completed"] .todo-agenda-card').count(), 0);
            await page.locator('.todo-agenda-group__history').click();
            assert.deepEqual(
              await page.locator('[data-agenda-group="completed"] .todo-agenda-card strong').allTextContents(),
              ['最近完成示例', '较早完成示例'],
            );
            assert.equal(await page.locator('[data-agenda-group="completed"] .todo-reminder-text').count(), 0);
            await page.locator('.todo-agenda-group__history').click();
            assert((await page.locator('[data-agenda-group="today"]').textContent()).includes('跨日任务'));
            assert((await page.locator('[data-agenda-group="upcoming"]').textContent()).includes('泡菜'));
          } else if (view === 'list') {
            await page.locator('.todo-item.is-workspace').first().waitFor();
            assert.equal(await page.locator('.is-workspace .todo-start-label').count(), 0);
            assert((await page.locator('.todo-item__no-deadline').first().textContent()).includes('—'));
            assert(
              (await page.locator('.todo-item__next-reminder').allTextContents()).some((text) =>
                text.includes('已暂停'),
              ),
            );
          } else {
            await page.locator('.todo-matrix').waitFor();
            if (width < 768) await page.locator('.todo-matrix__overview-button.is-otherNotUrgent').click();
            await page.locator('.todo-matrix-card').first().waitFor();
            assert(
              (await page.locator('.todo-reminder-text').allTextContents()).some((text) => text.includes('已暂停')),
            );
          }
          await page.locator('.inbox-scroll').evaluate((element) => {
            element.scrollTop = 0;
          });
          await page.waitForTimeout(180);
          if (capacityOnly) {
            capacities[density] = await page.locator('.todo-item.is-workspace').evaluateAll(
              (nodes) =>
                nodes.filter((node) => {
                  const panel = node.closest('.inbox-scroll').getBoundingClientRect();
                  const box = node.getBoundingClientRect();
                  return box.top >= panel.top && box.bottom <= panel.bottom;
                }).length,
            );
          }
          assert(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `${view}: page must not overflow at ${width}`,
          );
          const clipped = await page
            .locator('.todo-reminder-text')
            .evaluateAll((nodes) =>
              nodes.filter((node) => node.scrollWidth > node.clientWidth + 2).map((node) => node.textContent),
            );
          assert.deepEqual(clipped, [], `${view}: reminder text must wrap`);
          const label = `${capacityOnly ? 'capacity-' : ''}${view}-${width}-${theme}-${density}`;
          await page.screenshot({ path: `${output}/${label}.png` });
          reports.push(label);
          if (view === 'agenda' && width === 1440 && theme === 'day' && density === 'standard') {
            const calendarRequest = page.waitForRequest(
              (request) => request.url().endsWith('/api/todo/workspace') && request.postDataJSON()?.rangeStart,
            );
            await page.locator('.inbox-toolbar__todo-views').getByText('日历', { exact: true }).click();
            assert.notEqual(
              (await calendarRequest).postDataJSON().presentation,
              'agenda',
              'calendar clears agenda presentation',
            );
            const agendaRequest = page.waitForRequest(
              (request) =>
                request.url().endsWith('/api/todo/workspace') && request.postDataJSON()?.presentation === 'agenda',
            );
            await page.locator('.inbox-toolbar__todo-views').getByText('议程', { exact: true }).click();
            assert.equal((await agendaRequest).postDataJSON().rangeStart, undefined, 'agenda clears calendar range');
          }
          assert(
            !requests.some(([path]) => /\/todo\/(complete|update|snooze|v2\/delete)$/.test(path)),
            'review performs no writes',
          );
          await context.close();
          console.log(label);
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  if (capacityOnly)
    assert(capacities.compact > capacities.standard, `compact must show more full rows: ${JSON.stringify(capacities)}`);
  console.log(JSON.stringify({ cases: reports.length, output, capacities, errors }));
} finally {
  await browser.close();
}

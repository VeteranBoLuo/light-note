/** Real routes with intercepted local fixtures; no account or external service is used. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = '/tmp/ln-todo-attention';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const reports = [];
const errors = [];
const capacities = {};
const cases = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ width: 1440, theme, density, lang: 'zh-CN' })),
  ),
  ...[320, 390].flatMap((width) =>
    ['day', 'night'].map((theme) => ({ width, theme, density: 'small', lang: 'zh-CN' })),
  ),
  { width: 1440, theme: 'day', density: 'medium', lang: 'en-US', initialView: 'calendar' },
  { width: 390, theme: 'night', density: 'large', lang: 'en-US', initialView: 'matrix' },
  {
    width: 1440,
    theme: 'night',
    density: 'medium',
    lang: 'zh-CN',
    initialView: 'agenda',
    direct: true,
    multiple: true,
  },
  { width: 390, theme: 'day', density: 'medium', lang: 'zh-CN', initialView: 'calendar', direct: true },
];

try {
  for (const config of cases) {
    const { width, theme, density, lang, initialView = 'list', direct = false, multiple = false } = config;
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      timezoneId: 'Asia/Singapore',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
      const makeItem = (id, extra = {}) => ({
        id,
        title: id,
        description: '',
        status: 'pending',
        priority: 1,
        planVersion: 2,
        checklist: [],
        resourceRefs: [],
        tags: [],
        listId: null,
        dueAt: null,
        startAt: null,
        occurrenceDate: null,
        createdAt: '2026-11-01 08:00:00',
        updatedAt: '2026-11-04 08:00:00',
        ...extra,
      });
      const items = [
        makeItem('today-task', {
          title: (lang === 'zh-CN'
            ? '整理轻笺待办工作区的跨端交互体验，逐项核对导航角标、任务筛选、提醒时间与长标题的显示，并在本周评审前完成全部问题的记录和确认'
            : 'Review the todo workspace across desktop and mobile, verify navigation badges, task filters and reminder times, then record and confirm every issue before this week’s review'
          ).repeat(2),
          description:
            lang === 'zh-CN'
              ? '核对标题换行、描述阅读、日期与操作按钮，确保各个端型都能清楚阅读。'
              : 'Check title wrapping, descriptions, dates and actions on every supported screen size.',
          dueAt: '2026-11-04 18:00:00',
        }),
        ...Array.from({ length: 12 }, (_, index) =>
          makeItem(`future-${index}`, {
            title: lang === 'zh-CN' ? `后续安排 ${index + 1}` : `Upcoming task ${index + 1}`,
            dueAt: '2026-11-06 18:00:00',
          }),
        ),
        makeItem('reminder-only', {
          title: lang === 'zh-CN' ? '打卡' : 'Check in',
          reminder: {
            mode: 'once',
            version: 1,
            channels: ['in_app'],
            nextAt: '2026-11-04 18:35:00',
            once: { type: 'fixed_at', fixedAt: '2026-11-04 18:35:00' },
          },
        }),
        ...(multiple
          ? [
              makeItem('overdue-task', { title: '核对昨天的工作记录', dueAt: '2026-11-03 18:00:00' }),
              makeItem('scheduled-task', { title: '今天的全天安排', occurrenceDate: '2026-11-04' }),
              makeItem('scheduled-overdue-task', { title: '昨天未完成的全天安排', occurrenceDate: '2026-11-03' }),
            ]
          : []),
      ];
      const requests = [];
      let failNextAttention = false;
      const attentionIds = ['today-task', 'overdue-task', 'scheduled-task', 'scheduled-overdue-task'];
      const attentionCount = () =>
        items.filter((item) => attentionIds.includes(item.id) && item.status === 'pending').length;
      const expectedCount = attentionCount();
      function filtered(query) {
        return items.filter(
          (item) =>
            (!query.status || query.status === 'all' || item.status === query.status) &&
            (query.scope !== 'attention' || (attentionIds.includes(item.id) && item.status === 'pending')) &&
            (!query.keyword || item.title.includes(query.keyword)) &&
            (!query.ids || query.ids.includes(item.id)),
        );
      }
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let query = {};
        try {
          query = route.request().postDataJSON() || {};
        } catch {}
        requests.push([url.pathname, query]);
        const pendingItems = items.filter((item) => item.status === 'pending');
        const pending = pendingItems.length;
        const overdue = pendingItems.filter((item) => item.dueAt && item.dueAt < '2026-11-04 12:00:00').length;
        const dueToday = pendingItems.filter((item) => item.dueAt?.startsWith('2026-11-04')).length;
        const dated = pendingItems.filter((item) => item.dueAt || item.occurrenceDate).length;
        const counts = {
          lists: [],
          overview: {
            allTotal: pending,
            attention: attentionCount(),
            overdue,
            today: dueToday,
            week: pendingItems.filter((item) => item.dueAt && item.dueAt >= '2026-11-02' && item.dueAt < '2026-11-09')
              .length,
            scheduled: dated,
          },
          navigationCounts: {
            pending: { allTotal: pending, attention: attentionCount(), unassigned: pending, overdue, today: dueToday },
          },
          groupCounts: {},
        };
        let data = {};
        let status = 200;
        if (url.pathname === '/api/user/me')
          data = {
            id: 'attention-fixture',
            userName: 'fixture',
            alias: '测试用户',
            role: 'user',
            preferences: { todoView: initialView, theme, lang, uiScale: density },
          };
        else if (url.pathname === '/api/bookmark/queryTagList') data = [];
        else if (url.pathname === '/api/inbox/count' || url.pathname === '/api/todo/count')
          data = {
            todoPendingTotal: pending,
            pendingTotal: pending,
            todoAttentionTotal: attentionCount(),
            todoOverdueTotal: overdue,
            todoDueTodayTotal: attentionCount() - overdue,
          };
        else if (url.pathname === '/api/todo/workspace') {
          const selected = filtered(query);
          const pendingTotal = selected.filter((item) => item.status === 'pending').length;
          const completedTotal = selected.length - pendingTotal;
          if (failNextAttention && query.scope === 'attention') {
            failNextAttention = false;
            status = 500;
          } else
            data = {
              ...counts,
              total: selected.length,
              nextCursor: null,
              statusTotals: { pending: pendingTotal, completed: completedTotal, all: selected.length },
              ...(query.presentation === 'series'
                ? {
                    items: [],
                    groups: selected.length
                      ? [
                          {
                            key: query.scope === 'attention' ? 'all' : 'unassigned',
                            nodeCount: selected.length,
                            instanceCount: selected.length,
                          },
                        ]
                      : [],
                  }
                : { items: selected }),
            };
        } else if (url.pathname === '/api/todo/workspace/group')
          data = {
            nodes: filtered(query).map((item) => ({ kind: 'item', key: `todo:${item.id}`, item })),
            total: filtered(query).length,
            nextCursor: null,
          };
        else if (url.pathname === '/api/todo/complete') {
          items.find((item) => item.id === query.id).status = 'completed';
          data = { affected: 1 };
        } else if (/query.*List|\/list$/.test(url.pathname)) data = [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status, data, msg: '' }),
        });
      });
      await context.routeWebSocket('**/*', (socket) => socket.close());
      const entry = width >= 768 ? page.locator('#nav-todo-entry') : page.locator('.mobile-bottom-nav__item').nth(3);
      await page.goto(
        `${origin}/inbox?tab=todo${width < 768 ? '&renderProfile=mobile' : ''}${direct ? '&attention=1' : ''}`,
      );
      await entry.locator('[role="status"]').waitFor();
      if (!direct) await entry.click();
      await page.locator('.todo-attention-context').waitFor();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('attention'));
      await page.waitForFunction((count) => document.querySelectorAll('.todo-item').length === count, expectedCount);
      assert.equal(await page.locator('.todo-item').count(), expectedCount);
      const deadline = page.locator('.todo-item').filter({ hasText: items[0].title }).locator('.todo-item__meta');
      assert.match(await deadline.textContent(), lang === 'zh-CN' ? /今天.*截止时间/u : /Today.*Due date/u);
      if (multiple) {
        assert.match(
          await page
            .locator('.todo-item')
            .filter({ hasText: '今天的全天安排' })
            .locator('.todo-item__meta')
            .textContent(),
          /今天.*计划日期/u,
        );
        assert.match(
          await page
            .locator('.todo-item')
            .filter({ hasText: '昨天未完成的全天安排' })
            .locator('.todo-item__meta')
            .textContent(),
          /计划已逾期/u,
        );
      }
      const title = page.locator('.todo-item__title').first();
      const titleSize = await title.evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(node).lineHeight),
        fullHeight: node.scrollHeight,
      }));
      assert(titleSize.height <= titleSize.lineHeight * 2 + 1, 'List titles use at most two lines');
      assert(titleSize.fullHeight > titleSize.height, 'Long title fixture must exercise truncation');
      assert.equal(
        (await title.locator('..').textContent()).trim(),
        items[0].title,
        'Time status belongs in the time column',
      );
      assert(
        requests.some(
          ([path, query]) =>
            path === '/api/todo/workspace' && query.scope === 'attention' && query.status === 'pending',
        ),
      );
      assert(!requests.some(([path]) => /preference/i.test(path)), 'Attention entry must preserve the preferred view');
      if (width >= 768)
        assert(
          await page
            .locator('.todo-workspace-sidebar button.active')
            .textContent()
            .then((text) => text.includes(lang === 'zh-CN' ? '需关注' : 'Needs attention')),
        );
      else
        assert(
          await page.locator('html').evaluate((element) => element.classList.contains('light-note-mobile-rendering')),
        );
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(
        await page
          .locator('.todo-item__meta .todo-time-text')
          .evaluateAll((nodes) =>
            nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent),
          ),
        [],
      );
      const label = `${width}-${theme}-${density}-${lang}${direct ? '-direct' : ''}`;
      await page.screenshot({ path: `${output}/${label}.png`, animations: 'disabled' });
      await title.click();
      const detailTitle = page.locator('.todo-preview h2');
      await detailTitle.waitFor();
      assert.equal(await detailTitle.textContent(), items[0].title);
      assert(
        await detailTitle.evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
        'Details show the full title',
      );
      if (theme === 'day' && density === 'medium' && lang === 'zh-CN')
        await page.screenshot({ path: `${output}/detail-${width}.png`, animations: 'disabled' });
      await page.locator('.b-drawer-close:visible').first().click();
      await detailTitle.waitFor({ state: 'hidden' });

      // Re-enter on the same page after clearing the scope; old search must not hide the counted task.
      await page.locator('.todo-attention-context button').click();
      await page.locator('.todo-item').nth(1).waitFor();
      if (width === 1440 && theme === 'day' && lang === 'zh-CN')
        capacities[density] = await page.locator('.todo-item').evaluateAll(
          (nodes) =>
            nodes.filter((node) => {
              const panel = node.closest('.inbox-scroll').getBoundingClientRect();
              const box = node.getBoundingClientRect();
              return box.top >= panel.top && box.bottom <= panel.bottom;
            }).length,
        );
      if (width >= 768) {
        await page.locator('.todo-hero-search input').fill('no-match');
        await page.locator('.todo-hero-search input').press('Enter');
        await page.locator('.inbox-empty').waitFor();
      }
      const checkFailure = width === 1440 && theme === 'day' && density === 'medium' && lang === 'zh-CN';
      if (checkFailure) failNextAttention = true;
      await entry.click();
      await page.locator('.todo-attention-context').waitFor();
      if (checkFailure) {
        await page.locator('.inbox-error').waitFor();
        assert.equal(await page.locator('.todo-item').count(), 0, 'Failed scope entry must not display old tasks');
        await page.locator('.inbox-error button').click();
      }
      await page.waitForFunction((count) => document.querySelectorAll('.todo-item').length === count, expectedCount);
      assert.equal(await page.locator('.todo-item').count(), expectedCount);
      assert.equal(
        requests.filter(([path, query]) => path === '/api/todo/workspace' && query.scope === 'attention').at(-1)[1]
          .keyword,
        '',
      );

      // A failed refresh keeps the scope visible and permits an ordinary retry.
      if (checkFailure) {
        failNextAttention = true;
        await entry.click();
        await page.locator('.inbox-error, .inbox-error-banner').first().waitFor();
        await page.locator('.inbox-error button, .inbox-error-banner button').first().click();
        await page.locator('.todo-item').waitFor();
        await page.waitForFunction(() => !document.querySelector('.inbox-error, .inbox-error-banner'));
      }
      for (let remaining = expectedCount; remaining > 0; remaining--) {
        await page.locator('.todo-item__main-check').first().click();
        await page.waitForFunction((count) => document.querySelectorAll('.todo-item').length === count, remaining - 1);
      }
      await page
        .getByRole('heading', { name: lang === 'zh-CN' ? '暂无需要关注的待办' : 'No tasks need attention' })
        .waitFor();
      await page.waitForFunction((desktop) => {
        const entry = document.querySelector(desktop ? '#nav-todo-entry' : '.mobile-bottom-nav__item:nth-child(4)');
        return !entry?.querySelector('[role="status"]');
      }, width >= 768);
      await page.screenshot({ path: `${output}/${label}-empty.png`, animations: 'disabled' });
      reports.push(label);
      console.log(label);
    } catch (error) {
      await page.screenshot({ path: `${output}/failure.png` });
      console.error((await page.locator('body').innerText()).slice(0, 1800));
      throw error;
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  assert(
    capacities.small > capacities.medium,
    `Compact density must show more complete rows: ${JSON.stringify(capacities)}`,
  );
  console.log(JSON.stringify({ cases: reports.length, output, capacities, errors }));
} finally {
  await browser.close();
}

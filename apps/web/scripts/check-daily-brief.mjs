import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BRIEF_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(tmpdir(), 'lightnote-daily-brief-acceptance');
await mkdir(output, { recursive: true });
const actualState = process.env.BRIEF_ACTUAL_PREVIEW
  ? JSON.parse(await readFile(process.env.BRIEF_ACTUAL_PREVIEW, 'utf8'))
  : null;
const insights = [
  {
    id: 'todo_focus',
    factIds: ['todo_due_today'],
    text: '「提交报销材料」需要在今天 15:00 前完成，目前仍待处理。',
    sources: [{ type: 'todo', id: 'focus', title: '提交报销材料' }],
  },
  {
    id: 'workshop_due',
    factIds: ['workshop_due'],
    text: '阅读项目 · 今天到期 · 2026-10-22 · 完成阅读记录',
    sources: [{ type: 'learning_workspace', id: 'project', title: '阅读项目' }],
  },
  {
    id: 'workshop_result',
    factIds: ['workshop_result'],
    text: '《存储工具选型报告》已生成，尚未保存。',
    sources: [{ type: 'toolbox_task', id: 'report', title: '选型报告' }],
  },
  {
    id: 'organize_ai_pending',
    factIds: ['organize_ai_pending'],
    text: '有 3 条 AI 整理建议待审核。涉及书签和笔记，包括标题和标签建议。',
  },
  {
    id: 'organize_resources',
    factIds: ['organize_pending', 'organize_untagged'],
    text: '4 项资料待整理；510 项资源尚无标签。最近收集的有笔记《简报优化》、文件《方案截图.png》。',
  },
];
const brief = {
  version: 2,
  date: '2026-10-22',
  generatedBy: 'facts',
  headline: '',
  recommendation: '',
  insights,
  sections: [
    {
      id: 'organize',
      title: '待整理',
      items: [
        {
          id: 'organize_ai_pending',
          label: '待审核',
          count: 3,
          route: '/organize?issue=ai_suggestions&review=pending&runId=fixture-run&resourceType=note',
        },
        { id: 'organize_pending', label: '待整理资料', count: 4, route: '/organize?issue=pending' },
        { id: 'organize_untagged', label: '无标签资源', count: 510, route: '/organize?issue=untagged' },
      ],
    },
  ],
};
const englishBrief = {
  ...brief,
  insights: insights.map((item, index) => ({
    ...item,
    text: [
      '“Submit the reimbursement documents” is due today at 15:00 and is still pending.',
      'Reading project · Due today · 2026-10-22 · Complete the reading notes',
      '“Storage tools comparison report” is ready and has not been saved.',
      '3 organizing suggestions are ready for review. Covering bookmarks and notes; suggestions include titles and tags.',
      '4 resources await organizing; 510 resources have no tags. Recently collected: “Daily brief improvements” and “Design review screenshot.png”.',
    ][index],
    ...(item.context ? { context: '“Storage tools comparison report” is ready and has not been saved.' } : {}),
    ...(item.sources
      ? {
          sources: item.sources.map((source) => ({
            ...source,
            title: ['Reimbursement documents', 'Reading project', 'Storage tools comparison report'][index],
          })),
        }
      : {}),
  })),
};
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const context = await browser.newContext();
let checked = 0;
const cases = [];
for (const mobile of [false, true])
  for (const theme of ['day', 'night'])
    for (const density of mobile ? ['standard'] : ['small', 'standard', 'large'])
      for (const mode of [
        'mixed',
        'priority',
        'advice',
        'advice-stale',
        'advice-failed',
        'advice-retry',
        'advice-quota-exhausted',
        'advice-quota-insufficient',
        'advice-quota-readonly',
        'onboarding',
        'onboarding-readonly',
      ])
        cases.push({ mobile, theme, density, mode, locale: 'zh-CN' });
for (const mobile of [false, true])
  for (const theme of ['day', 'night']) {
    cases.push({ mobile, theme, density: 'standard', mode: 'reference', locale: 'zh-CN' });
    if (actualState) cases.push({ mobile, theme, density: 'standard', mode: 'actual', locale: 'zh-CN' });
    cases.push({
      mobile,
      theme,
      density: mobile ? 'standard' : theme === 'day' ? 'small' : 'large',
      mode: 'mixed',
      locale: 'en-US',
    });
    cases.push({ mobile, theme, density: 'standard', mode: 'priority', locale: 'en-US' });
    cases.push({ mobile, theme, density: 'standard', mode: 'advice', locale: 'en-US' });
    cases.push({ mobile, theme, density: 'standard', mode: 'onboarding', locale: 'en-US' });
    for (const mode of ['advice-quota-exhausted', 'advice-quota-insufficient', 'advice-quota-readonly'])
      cases.push({ mobile, theme, density: 'standard', mode, locale: 'en-US' });
  }
for (const mobile of [false, true]) {
  cases.push({ mobile, theme: 'day', density: 'standard', mode: 'quiet', locale: 'zh-CN' });
  cases.push({ mobile, theme: 'night', density: 'standard', mode: 'stale', locale: 'zh-CN' });
}
for (const mobile of [false, true])
  for (const mode of ['single', 'pair'])
    cases.push({ mobile, theme: 'day', density: 'standard', mode, locale: 'zh-CN' });
for (const mobile of [false, true])
  for (const theme of ['day', 'night'])
    for (const mode of ['restored', 'activity', 'no-new', 'no-new-quiet'])
      cases.push({ mobile, theme, density: 'standard', mode, locale: 'zh-CN' });
for (const width of [767, 768, 1199, 1920, 2560])
  cases.push({ mobile: false, theme: 'day', density: 'standard', mode: 'reference', locale: 'zh-CN', width });
for (const mobile of [false, true])
  for (const mode of ['no-new', 'no-new-quiet'])
    cases.push({ mobile, theme: 'day', density: 'standard', mode, locale: 'en-US' });
for (const theme of ['day', 'night'])
  for (const density of ['small', 'large'])
    for (const mode of ['restored', 'no-new']) cases.push({ mobile: false, theme, density, mode, locale: 'zh-CN' });
const requestedModes = process.env.BRIEF_TEST_MODES?.split(',');
for (const mobile of [false, true])
  for (const theme of ['day', 'night'])
    for (const density of mobile ? ['standard'] : ['small', 'standard', 'large'])
      for (const mode of ['advice-empty', 'advice-unreadable', 'advice-deferred'])
        cases.push({ mobile, theme, density, mode, locale: 'zh-CN' });
const casesToRun = requestedModes ? cases.filter(({ mode }) => requestedModes.includes(mode)) : cases;
assert(casesToRun.length > 0, 'At least one browser case must run');
try {
  for (const { mobile, theme, density, mode, locale, width } of casesToRun) {
    const viewportWidth = width || (mobile ? 390 : 1366);
    const stacked = mobile || viewportWidth < 768;
    const labels =
      locale === 'en-US'
        ? {
            organize: 'Organize',
            review: 'Review AI suggestions',
            pending: 'View pending resources',
            untagged: 'Organize untagged content',
          }
        : { organize: '整理', review: '审核 AI 建议', pending: '查看待整理资料', untagged: '整理无标签内容' };
    const page = await context.newPage();
    await page.setViewportSize({ width: viewportWidth, height: mobile ? 844 : 850 });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let posts = 0;
    const localizedBrief = locale === 'en-US' ? englishBrief : brief;
    let selectedBrief =
      mode === 'actual'
        ? actualState.brief
        : mode === 'reference'
          ? { ...brief, insights: brief.insights.filter((item) => item.id !== 'workshop_due') }
          : mode === 'single' || mode === 'pair'
            ? { ...brief, insights: mode === 'single' ? [insights[0]] : [insights[0], insights[2]] }
            : mode === 'restored' || mode === 'activity'
              ? {
                  ...brief,
                  headline:
                    mode === 'restored' ? '今天新增 2 条书签和1 个文件，仍有资料待整理' : '今天新增 2 条书签和1 个文件',
                  insights: mode === 'activity' ? [] : brief.insights.filter((item) => item.id !== 'workshop_due'),
                  recommendation:
                    mode === 'restored' ? '先处理有截止要求的「提交报销材料」，之后再核对本轮整理建议。' : '',
                  recommendationKind: 'action',
                  recommendationFactIds: ['todo_due_today', 'organize_ai_pending'],
                  sections: [
                    ...brief.sections,
                    {
                      id: 'new_content',
                      title: '今日新增',
                      items: [
                        { id: 'bookmark_created_today', count: 2 },
                        { id: 'file_created_today', count: 1 },
                      ],
                    },
                  ],
                }
              : localizedBrief;
    if (mode === 'priority') {
      const english = locale === 'en-US';
      selectedBrief = {
        ...localizedBrief,
        insights: [
          {
            id: 'workshop_attention',
            factIds: ['workshop_attention'],
            text: english ? 'Result could not be saved: Source summary' : '工坊成果保存失败：资料摘要',
            sources: [{ type: 'toolbox_task', id: 'failed-job', title: english ? 'Source summary' : '资料摘要' }],
          },
          ...localizedBrief.insights.slice(0, 3),
          {
            id: 'organize_summary',
            factIds: ['organize_ai_pending', 'organize_pending', 'organize_untagged'],
            text: localizedBrief.insights
              .slice(3)
              .map((item) => item.text)
              .join(' '),
          },
        ],
        recommendation: english
          ? 'Open “Source summary” to check why it failed before continuing.'
          : '可先打开「资料摘要」确认失败原因，再继续处理。',
        recommendationKind: 'action',
        recommendationFactIds: ['workshop_attention'],
      };
    }
    if (mode === 'no-new' || mode === 'no-new-quiet') {
      selectedBrief = {
        ...localizedBrief,
        headline:
          locale === 'en-US'
            ? mode === 'no-new'
              ? 'No resources added today; resources still await organizing'
              : 'No resources added today, and nothing needs special attention.'
            : mode === 'no-new'
              ? '今天暂无新增资源，仍有资料待整理'
              : '今天暂无新增资源，也没有需要特别关注的事项。',
        insights: mode === 'no-new' ? localizedBrief.insights : [],
        sections: [
          ...(mode === 'no-new' ? localizedBrief.sections : []),
          {
            id: 'new_content',
            title: '今日新增',
            items: ['bookmark', 'note', 'file'].map((type) => ({ id: `${type}_created_today`, count: 0 })),
          },
        ],
      };
    }
    if (mode === 'advice' || mode === 'advice-stale')
      selectedBrief = {
        ...localizedBrief,
        recommendation: '先完成今天到期的待办，再查看并保存工坊已经生成的成果，之后继续处理整理事项。',
        recommendationKind: 'ai',
        recommendationFactIds: ['todo_due_today', 'workshop_result'],
        recommendationSources: [{ type: 'toolbox_task', id: 'report', title: '选型报告' }],
      };
    if (mode === 'advice' && locale === 'en-US')
      selectedBrief.recommendation =
        'Finish the task due today first, then check and save the workshop result before continuing with organizing.';
    if (mode.startsWith('onboarding'))
      selectedBrief = {
        ...localizedBrief,
        insights: [],
        sections: [],
        adviceStatus: 'ready',
        headline:
          locale === 'en-US'
            ? 'No resources added today, and nothing needs special attention.'
            : '今天暂无新增资源，也没有需要特别关注的事项。',
        recommendation:
          locale === 'en-US'
            ? 'Start by collecting a resource, writing a note, or creating a to-do—one small step to get started with Light Note.'
            : '可以先收集一份资料、写一篇笔记，或新建一条待办，从一件小事开始使用轻笺。',
        recommendationKind: 'action',
        recommendationFactIds: ['onboarding_empty'],
        recommendationSources: [],
      };
    if (mode === 'advice-failed' || mode === 'advice-retry')
      selectedBrief = { ...localizedBrief, adviceStatus: 'failed', recommendation: '' };
    if (mode.startsWith('advice-quota-'))
      selectedBrief = {
        ...localizedBrief,
        adviceStatus: 'failed',
        recommendation: '',
        adviceFailureCode:
          mode === 'advice-quota-insufficient' ? 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST' : 'AI_QUOTA_EXCEEDED',
        lastAdviceResult: {
          adviceStatus: 'ready',
          recommendation:
            locale === 'en-US'
              ? 'Check the saved workshop result before continuing.'
              : '可以先查看已生成的工坊成果，再继续整理资料。',
        },
      };
    const adviceStates = {
      'advice-empty': 'no_value',
      'advice-unreadable': 'no_evidence',
      'advice-deferred': 'deferred',
    };
    if (adviceStates[mode]) selectedBrief = { ...localizedBrief, adviceStatus: adviceStates[mode], recommendation: '' };
    if (mode === 'advice-deferred' || mode === 'advice-failed')
      selectedBrief.lastAdviceResult = { adviceStatus: 'no_value', recommendation: '' };
    const data =
      mode === 'actual'
        ? { ...actualState, shouldGenerate: false }
        : {
            featureEnabled: true,
            enabled: true,
            status: 'ready',
            date: '2026-10-22',
            nextDateAt: new Date(Date.now() + 86400000).toISOString(),
            timezone: 'Asia/Shanghai',
            autoUpdate: true,
            stale: mode === 'stale' || mode === 'advice-stale',
            staleFactIds:
              mode === 'advice-stale'
                ? ['workshop_result']
                : mode === 'stale'
                  ? ['todo_due_today', 'organize_pending']
                  : [],
            shouldGenerate: false,
            generatedAt: '2026-10-22T02:00:00Z',
            dataAsOf: '2026-10-22T02:00:00Z',
            brief: mode === 'quiet' ? { ...brief, headline: '今天暂无需特别关注的事项', insights: [] } : selectedBrief,
          };
    let checkReads = 0;
    let releaseCheck;
    let backgroundStarted;
    const backgroundReady = new Promise((resolve) => {
      backgroundStarted = resolve;
    });
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        if (
          mode === 'advice-retry' &&
          new URL(route.request().url()).searchParams.get('check') === '1' &&
          ++checkReads === 2
        ) {
          await new Promise((resolve) => {
            releaseCheck = resolve;
            backgroundStarted();
          });
        }
        if (
          route.request().method() === 'POST' &&
          new URL(route.request().url()).pathname.includes('/workbench/daily-brief/')
        ) {
          posts++;
          if (mode === 'advice-retry')
            data.brief = {
              ...data.brief,
              adviceStatus: 'no_value',
              lastAdviceResult: { adviceStatus: 'no_value', recommendation: '' },
            };
        }
        await route.fulfill({
          json: {
            status: 200,
            data: route.request().url().includes('/workbench/daily-brief') ? data : {},
            msg: 'ok',
          },
        });
      },
    );
    const query = new URLSearchParams({
      theme,
      density,
      locale,
      ...(['onboarding-readonly', 'advice-quota-readonly'].includes(mode) ? { preview: '1' } : {}),
      ...(mobile ? { renderProfile: 'mobile' } : {}),
    });
    await page.goto(`${origin}/e2e/brief-bookmark-adoption.html?${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const card = page.locator('.daily-brief-card').first();
    await card.waitFor();
    assert(Math.abs((await card.boundingBox()).width - viewportWidth) < 2, '验收卡片必须使用实际视口宽度');
    await page
      .getByText(
        ['quiet', 'activity', 'no-new-quiet', 'onboarding', 'onboarding-readonly'].includes(mode)
          ? data.brief.headline
          : selectedBrief.insights[0].text,
        {
          exact: false,
        },
      )
      .first()
      .waitFor();
    assert.equal(
      await page
        .locator(
          '.daily-brief-card__recommendation:not(.daily-brief-card__advice-status),.daily-brief-card__preview-recommendation:not(.daily-brief-card__advice-status)',
        )
        .count(),
      selectedBrief.recommendation || selectedBrief.lastAdviceResult?.recommendation ? 1 : 0,
    );
    if (mode.startsWith('onboarding')) {
      await card.getByText(locale === 'en-US' ? 'Getting started' : '使用引导', { exact: true }).waitFor();
      await card.getByText(selectedBrief.recommendation, { exact: true }).waitFor();
      assert.equal(await card.locator('.daily-brief-card__advice-status').count(), 0);
      const actions = card.locator('.daily-brief-card__onboarding-actions button');
      assert.equal(await actions.count(), mode === 'onboarding-readonly' ? 0 : 3);
      if (mode === 'onboarding') {
        const names =
          locale === 'en-US' ? ['Collect resources', 'Write a note', 'New to-do'] : ['收集资料', '写笔记', '新建待办'];
        for (const [index, type] of ['bookmark', 'note', 'todo'].entries()) {
          await card.getByRole('button', { name: names[index], exact: true }).click();
          await page.locator(`.capture-workspace.is-${type}`).waitFor();
          if (mobile) {
            await page.waitForFunction(() => Boolean(history.state?.__lnMobileOverlayId));
            await page.evaluate(() => history.back());
          } else await page.keyboard.press('Escape');
          await page.locator('.capture-workspace').waitFor({ state: 'hidden' });
          await card.getByRole('button', { name: names[index], exact: true }).waitFor();
        }
      }

      assert.equal(await card.getByText(locale === 'en-US' ? 'AI suggestion' : 'AI 建议', { exact: true }).count(), 0);
    }
    if (mode === 'restored') {
      await page.getByText(selectedBrief.headline, { exact: true }).waitFor();
      await page.getByText('处理建议', { exact: true }).waitFor();
    }
    if (mode.startsWith('no-new')) {
      assert.equal(await card.getByText(selectedBrief.headline, { exact: true }).count(), 1);
      assert.equal(await card.getByText(/昨日|昨天|待消化/).count(), 0);
    }
    if (mode === 'priority' && mobile)
      assert.equal(
        await card.locator('.daily-brief-card__headline').textContent(),
        selectedBrief.insights[0].text,
        '移动摘要直接显示失败提醒',
      );
    if (['quiet', 'activity', 'no-new-quiet', 'onboarding', 'onboarding-readonly'].includes(mode)) {
      assert.equal(await page.locator('.daily-brief-insight').count(), 0);
      assert.equal(await page.locator('.daily-brief-card__view-brief').count(), 0);
    } else {
      if (mobile) await page.locator('.daily-brief-card__view-brief').click();
      await page.locator('.daily-brief-insight').last().waitFor();
      const organizing = selectedBrief.insights.filter(
        (item) => item.factIds.length && item.factIds.every((id) => id.startsWith('organize_')),
      ).length;
      assert.equal(
        await page.locator('.daily-brief-insight').count(),
        selectedBrief.insights.length - Math.max(0, organizing - 1),
      );
      if (mode === 'priority') {
        assert.equal(await page.locator('.daily-brief-insight').count(), 5);
        assert(
          (await page.locator('.daily-brief-insight').first().textContent()).includes(selectedBrief.insights[0].text),
        );
      }
      assert.equal(
        await page
          .locator('.daily-brief-insight__marker')
          .filter({ hasText: new RegExp(`^${labels.organize}$`) })
          .count(),
        organizing ? 1 : 0,
      );
      assert.equal(
        await page
          .locator('.daily-brief-insight__marker .b-chip__content')
          .evaluateAll((nodes) => nodes.some((node) => node.scrollWidth > node.clientWidth + 1)),
        false,
        `类别完整显示：${locale}/${density}/${theme}/${viewportWidth}`,
      );
      const rows = await page.locator('.daily-brief-insight').evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom };
        }),
      );
      const lead = await page.locator('.daily-brief-insight.is-lead').count();
      if (stacked)
        assert(
          await page
            .locator('.daily-brief-insight')
            .evaluateAll((nodes) =>
              nodes.slice(1).every((node) => parseFloat(getComputedStyle(node).borderTopWidth) > 0),
            ),
          '移动端每项之间保留分隔线',
        );
      if (stacked || rows.length === 1) {
        rows.forEach((row, index) => {
          assert(Math.abs(row.left - rows[0].left) < 1);
          assert(Math.abs(row.width - rows[0].width) < 1);
          if (index) assert(row.top >= rows[index - 1].bottom - 1);
        });
      } else {
        const paired = lead ? rows.slice(1) : rows;
        assert(paired.length >= 2);
        assert(Math.abs(paired[0].top - paired[1].top) < 1, '宽屏正文并排');
        assert(paired[1].left >= paired[0].left + paired[0].width, '两栏不能重叠');
        assert(Math.abs(paired[0].width - paired[1].width) < 1);
        if (lead) {
          assert(rows[0].width > paired[0].width * 1.9, '重点待办独占紧凑一行');
          assert(paired[0].top >= rows[0].bottom - 1);
        }
        if (paired.length > 2) assert(paired[2].top >= paired[0].bottom - 1);
      }
      const geometry = await page.locator('.daily-brief-insight__copy').evaluateAll((nodes) =>
        nodes.map((node) => {
          const paragraphs = node.querySelectorAll('p');
          const text = paragraphs[paragraphs.length - 1].getBoundingClientRect();
          const actions = node.querySelector('.daily-brief-insight__actions')?.getBoundingClientRect();
          return actions
            ? {
                lead: node.parentElement.classList.contains('is-lead'),
                textRight: text.right,
                textBottom: text.bottom,
                actionLeft: actions.left,
                actionTop: actions.top,
              }
            : null;
        }),
      );
      geometry
        .filter(Boolean)
        .forEach((row) =>
          assert(
            row.actionTop >= row.textBottom - 1 || (!stacked && row.lead && row.actionLeft >= row.textRight - 1),
            '入口跟随正文，重点待办可同行',
          ),
        );
      if (selectedBrief.insights.some((item) => item.context))
        assert.equal(await page.locator('.daily-brief-insight__context').count(), 1);
      assert.equal(
        await page.locator('.daily-brief-insight').filter({ hasText: selectedBrief.insights[0].text }).count(),
        1,
      );
      if (organizing) {
        const group = page.locator('.daily-brief-insight.is-organize');
        assert.equal(await group.count(), 1);
        for (const item of selectedBrief.insights.filter((item) =>
          item.factIds.every((id) => id.startsWith('organize_')),
        ))
          assert((await group.textContent()).includes(item.text));
        assert.equal(await page.getByRole('button', { name: labels.pending, exact: true }).isDisabled(), false);
      }
      const task = page.locator('.daily-brief-insight__sources button').first();
      assert.equal(await task.isDisabled(), mode === 'stale');
      assert.equal(await page.getByText('查看全部', { exact: true }).count(), 0);
      if (mode === 'priority') {
        await task.click();
        await page.waitForFunction(
          () => document.documentElement.dataset.briefNavigation === '/toolbox/task/failed-job',
        );
      }
      if (['mixed', 'reference', 'actual', 'restored', 'priority'].includes(mode)) {
        const todo = selectedBrief.insights.find((item) => item.factIds.some((id) => id.startsWith('todo_')));
        if (todo) {
          const task = page
            .locator('.daily-brief-insight')
            .filter({ hasText: todo.text })
            .locator('.daily-brief-insight__sources button')
            .first();
          await task.click();
          await page.waitForFunction(
            (id) => document.documentElement.dataset.briefNavigation === `/inbox?tab=todo&todoId=${id}`,
            todo.sources[0].id,
          );
        }
        const reviewItem = selectedBrief.sections
          ?.find((section) => section.id === 'organize')
          ?.items.find((item) => item.id === 'organize_ai_pending');
        if (reviewItem?.count > 0) {
          await page.getByRole('button', { name: labels.review, exact: true }).click();
          const runId = new URL(reviewItem.route, origin).searchParams.get('runId');
          await page.waitForFunction(
            (id) => document.documentElement.dataset.briefNavigation?.includes(`runId=${id}`),
            runId,
          );
        }
        for (const [label, target] of [
          [labels.pending, '/organize?issue=pending'],
          [labels.untagged, '/organize?issue=untagged'],
        ]) {
          await page.getByRole('button', { name: label, exact: true }).click();
          await page.waitForFunction((route) => document.documentElement.dataset.briefNavigation === route, target);
        }
      }
    }
    if (mode === 'advice-failed') await page.getByText('本次建议更新未成功', { exact: false }).first().waitFor();
    if (mode.startsWith('advice-quota-')) {
      const exhausted = mode !== 'advice-quota-insufficient';
      const hint =
        locale === 'en-US'
          ? exhausted
            ? 'Your available AI quota is exhausted.'
            : 'You still have AI quota, but it is insufficient'
          : exhausted
            ? '可用 AI 额度已用完'
            : '当前仍有 AI 额度，但不足以生成本次 AI 建议';
      await card.getByText(hint, { exact: false }).waitFor();
      await card.getByText(selectedBrief.lastAdviceResult.recommendation, { exact: true }).waitFor();
      const retryHint = locale === 'en-US' ? 'select Update to retry' : '可点击更新重试';
      assert.equal(await card.getByText(retryHint, { exact: false }).count(), mode === 'advice-quota-readonly' ? 0 : 1);
    }
    if (mode === 'advice-retry') {
      const update = page.getByRole('button', { name: '更新简报', exact: true }).first();
      await page.waitForFunction(() => !document.querySelector('[aria-label="更新简报"]')?.disabled);
      await page.waitForTimeout(1100);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await Promise.race([
        backgroundReady,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Background check did not start')), 5000)),
      ]);
      await update.click();
      assert.equal(posts, 0);
      releaseCheck();
      await page
        .locator('.daily-brief-card__advice-status')
        .getByText('暂无需要补充的建议', { exact: true })
        .first()
        .waitFor();
    }
    if (adviceStates[mode]) {
      const hints = {
        'advice-empty': '暂无需要补充的建议',
        'advice-unreadable': '当前没有需要补充行动建议的事项。',
        'advice-deferred': '暂无需要补充的建议',
      };
      await page.locator('.daily-brief-card__advice-status').getByText(hints[mode], { exact: true }).first().waitFor();
      await Promise.all([
        page.waitForResponse(
          (response) => response.request().method() === 'POST' && response.url().includes('/workbench/daily-brief/'),
        ),
        page.getByRole('button', { name: '更新简报', exact: true }).first().click(),
      ]);
      await page.locator('.daily-brief-card__advice-status').getByText(hints[mode], { exact: true }).first().waitFor();
    }
    if (mode === 'advice' || mode === 'advice-stale') {
      const advice = page.locator('.daily-brief-card__recommendation');
      assert((await advice.textContent()).includes(selectedBrief.recommendation));
      const source = advice.getByRole('button', { name: '选型报告', exact: true });
      assert.equal(await source.isDisabled(), mode === 'advice-stale');
      if (mode === 'advice') {
        await source.click();
        await page.waitForFunction(() => document.documentElement.dataset.briefNavigation === '/toolbox/task/report');
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
    if (density === 'standard') {
      const path = join(
        output,
        `${mobile ? 'mobile' : 'desktop'}-${theme}-${mode}${locale === 'en-US' ? '-en' : ''}${width ? `-${width}` : ''}.png`,
      );
      if (mobile) await page.screenshot({ path, fullPage: true, animations: 'disabled' });
      else await card.screenshot({ path, animations: 'disabled' });
    }
    assert.deepEqual(errors, []);
    assert.equal(posts, adviceStates[mode] || mode === 'advice-retry' ? 1 : 0);
    checked++;
    if (checked % 8 === 0) console.log(`Daily brief browser cases: ${checked}/${casesToRun.length}`);
    await page.close();
  }
  console.log(`Daily brief: ${checked} browser cases passed. Screenshots: ${output}`);
} finally {
  await browser.close();
}

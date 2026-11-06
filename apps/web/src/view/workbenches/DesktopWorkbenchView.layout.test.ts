import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopSource = readFileSync(
  resolve(process.cwd(), 'src/view/workbenches/DesktopWorkbenchView.vue'),
  'utf8',
).replace(/var\(--ui-(?:space|control|layout|font|card)-[\d_]+, ([\d.]+px)\)/g, '$1');

describe('桌面工作台头部布局稳定性', () => {
  it('新建入口位于页头右侧，右栏只保留成长卡', () => {
    const headerSource = desktopSource.slice(
      desktopSource.indexOf('<header class="workbench-header">'),
      desktopSource.indexOf('</header>'),
    );
    expect(desktopSource).not.toContain('workbench.header.quickCapture');
    expect(desktopSource).not.toContain('quick-create-panel');
    expect(headerSource).toContain('class="workbench-quick-create"');
    expect(headerSource).toContain('openQuickCapture(action.type)');
  });

  it('待处理总览在简报下方单独一行，首屏为今日待处理、继续处理与成长三卡', () => {
    const briefIndex = desktopSource.indexOf('class="workbench-brief"');
    const summaryIndex = desktopSource.indexOf('<section class="today-summary"');
    const firstFoldStart = desktopSource.indexOf('<section class="workbench-first-fold"');
    const firstFoldEnd = desktopSource.indexOf('</section>', desktopSource.indexOf('</aside>', firstFoldStart)) + 10;
    const firstFoldSource = desktopSource.slice(firstFoldStart, firstFoldEnd);
    const resourceOverviewStart = desktopSource.indexOf(
      '<section class="primary-grid" :aria-label="t(\'workbench.panel.resourceOverview\')">',
    );

    expect(summaryIndex).toBeGreaterThan(briefIndex);
    expect(firstFoldStart).toBeGreaterThan(summaryIndex);
    expect(firstFoldSource).toContain('<div v-if="!todayCollapsed" class="today-summary-details">');
    expect(firstFoldSource).toContain('<article class="today-continue">');
    expect(firstFoldSource).toContain('<WorkbenchGrowth expanded />');
    expect(resourceOverviewStart).toBeGreaterThan(firstFoldEnd);
    expect(desktopSource).toMatch(/\.workbench-first-fold__rail :deep\(\.growth-card\)\s*\{[\s\S]*?height:\s*100%/);
  });

  it('待办格写明其中今天的数量，与导航角标同用注意力口径', () => {
    expect(desktopSource).toContain('keypath="workbench.today.todoPendingTodayHint"');
    expect(desktopSource).toContain('{{ inbox.todoAttentionTotal }}');
  });

  it('今日待处理清空后只在完整加载或回到前台时收起', () => {
    expect(desktopSource).toContain('settleTodayLayout(!silent || options.settleLayout === true)');
    expect(desktopSource).toContain('fetchWorkbenchSummary({ silent: true, settleLayout: true })');
  });

  it('1200 以下首屏改为两列并让成长卡占满，不提前折叠成类移动布局', () => {
    expect(desktopSource).toContain('@media (max-width: 1199px)');
    expect(desktopSource).not.toContain('@media (max-width: 1380px)');
    expect(desktopSource).toMatch(
      /@media \(max-width: 1199px\)\s*\{[\s\S]*?\.workbench-first-fold\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });

  it('首屏常驻数据范围行并显示更新时间加载状态', () => {
    expect(desktopSource).toContain('<small class="workbench-data-scope">');
    expect(desktopSource).not.toContain('<small v-if="lastUpdatedAt" class="workbench-data-scope">');
    expect(desktopSource).toMatch(
      /workbench\.meta\.todayRange[\s\S]*?class="workbench-data-updated"[\s\S]*?lastUpdatedAt \?[\s\S]*?common\.loading/,
    );
    expect(desktopSource).toMatch(/\.workbench-data-scope\s*\{[\s\S]*?min-height:\s*1\.4em/);
    expect(desktopSource).toMatch(/\.workbench-data-updated\s*\{[\s\S]*?min-width:\s*12em/);
  });

  it('最近更新的三种兼容数据来源统一最多展示五条要点', () => {
    expect(desktopSource).toContain('const LATEST_UPDATE_ITEM_LIMIT = 5;');
    expect(desktopSource).toContain('updateLogMarkdownSummaryItems(item.contentMarkdown, LATEST_UPDATE_ITEM_LIMIT)');
    expect(desktopSource).toContain('item.highlights.slice(0, LATEST_UPDATE_ITEM_LIMIT)');
    expect(desktopSource).toContain('item.list.slice(0, LATEST_UPDATE_ITEM_LIMIT)');
  });

  it('待处理卡片不再重复提供快速创建，新建统一走页头入口', () => {
    expect(desktopSource).not.toContain(':show-empty-action="true"');
    expect(desktopSource).toMatch(
      /function openQuickCapture\(type\?: ActionCaptureType\)[\s\S]*?inbox\.openQuickCapture\(\);/,
    );
  });

  it('每日任务只展示进度，领取统一收口到上方我的成长卡', () => {
    expect(desktopSource).toContain(':show-claim-action="false"');
    expect(desktopSource).toContain('@go="handleDailyQuestAction"');
    expect(desktopSource).toContain('resolveDailyQuestRoute(key, false)');
    expect(desktopSource).not.toContain('@claim="claimDailyGrowth"');
    expect(desktopSource).not.toContain('function claimDailyGrowth');
  });

  it('第二分栏展示共享每日回顾，并让初始化与前台刷新共用回顾读模型', () => {
    const firstFoldIndex = desktopSource.indexOf('<section class="workbench-first-fold"');
    const routineIndex = desktopSource.indexOf('<section class="workbench-routine-grid"');
    const reviewIndex = desktopSource.indexOf('<DailyReviewCard :read-only="growthReadOnly" />');
    const dailyQuestsIndex = desktopSource.indexOf('<DailyQuests');

    expect(desktopSource).toContain("import DailyReviewCard from '@/components/workbenches/DailyReviewCard.vue'");
    expect(desktopSource).toContain("import { useDailyReview } from '@/composables/useDailyReview.ts'");
    expect(routineIndex).toBeGreaterThan(firstFoldIndex);
    expect(reviewIndex).toBeGreaterThan(routineIndex);
    expect(reviewIndex).toBeLessThan(dailyQuestsIndex);
    expect(desktopSource).toContain(':read-only="growthReadOnly"');
    expect(desktopSource.match(/refreshDailyReview\(\)/g)).toHaveLength(3);
    expect(desktopSource).not.toContain('loadRecap');
  });

  it('简报通栏置顶，回顾与任务使用独立卡片并复用非弹框回顾', () => {
    const routineStart = desktopSource.indexOf('<section class="workbench-routine-grid"');
    const briefIndex = desktopSource.indexOf('class="workbench-brief"');
    const reviewColumnIndex = desktopSource.indexOf('<div class="workbench-routine-grid__review">');
    const resourceOverviewIndex = desktopSource.indexOf(
      '<section class="primary-grid" :aria-label="t(\'workbench.panel.resourceOverview\')">',
    );

    expect(routineStart).toBeGreaterThan(-1);
    expect(briefIndex).toBeLessThan(routineStart);
    expect(reviewColumnIndex).toBeGreaterThan(briefIndex);
    expect(resourceOverviewIndex).toBeGreaterThan(reviewColumnIndex);
    expect(desktopSource).toMatch(
      /\.workbench-routine-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(desktopSource).toContain('.workbench-brief:empty');
    expect(desktopSource).toContain('class="workbench-routine-grid__tasks"');
    // 回顾正常为空时不渲染根节点，调用处不能再传 class，否则 Vue 无处挂载并告警。
    expect(desktopSource).toContain('<DailyReviewCard :read-only="growthReadOnly" />');
    expect(desktopSource).not.toContain('height: 206px');
  });

  it('今日简报只在桌面布局加载，默认开启时由独立卡片按日确保生成', () => {
    const firstFoldIndex = desktopSource.indexOf('<section class="workbench-first-fold"');
    const briefIndex = desktopSource.indexOf('<DailyBriefCard');
    const reviewIndex = desktopSource.indexOf('<DailyReviewCard :read-only="growthReadOnly" />');

    expect(desktopSource).toContain("import DailyBriefCard from '@/components/workbenches/DailyBriefCard.vue'");
    expect(desktopSource).toContain('v-if="bookmark.isDesktop"');
    expect(briefIndex).toBeLessThan(firstFoldIndex);
    expect(briefIndex).toBeLessThan(reviewIndex);
    expect(desktopSource).toContain(':eligible="Boolean(user.id && user.role !== \'visitor\')"');
    expect(desktopSource).toContain(':read-only="growthReadOnly"');
    expect(desktopSource).toContain('dailyBriefCardRef.value?.refresh()');
  });

  it('继续处理资源页签默认最多展示四条', () => {
    expect(desktopSource).toContain('const CONTINUE_ITEM_LIMIT = 4;');
    expect(desktopSource).toContain('slice(0, CONTINUE_ITEM_LIMIT)');
    expect(desktopSource).toContain('activeContinueItems.length === CONTINUE_ITEM_LIMIT');
    expect(desktopSource).toMatch(
      /\.content-list--distributed\s*>\s*\.content-row,[\s\S]*?\.content-list--distributed\s*>\s*\.content-skeleton-row\s*\{[\s\S]*?flex:\s*1 1 0/,
    );
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopSource = readFileSync(resolve(process.cwd(), 'src/view/workbenches/DesktopWorkbenchView.vue'), 'utf8');

describe('桌面工作台头部布局稳定性', () => {
  it('页头不再重复提供快速添加，右侧快速创建面板继续保留', () => {
    expect(desktopSource).not.toContain('workbench.header.quickCapture');
    expect(desktopSource).not.toContain('capture-button');
    expect(desktopSource).toContain('quick-create-panel');
    expect(desktopSource).toContain('openQuickCapture(action.type)');
  });

  it('首屏把待处理总览与快速创建、成长卡片组成主次分栏，资源概览继续保留在下方', () => {
    const firstFoldStart = desktopSource.indexOf('<section class="workbench-first-fold">');
    const firstFoldEnd = desktopSource.indexOf('</section>', desktopSource.indexOf('</aside>', firstFoldStart)) + 10;
    const firstFoldSource = desktopSource.slice(firstFoldStart, firstFoldEnd);
    const resourceOverviewStart = desktopSource.indexOf(
      '<section class="primary-grid" :aria-label="t(\'workbench.panel.resourceOverview\')">',
    );

    expect(firstFoldStart).toBeGreaterThan(-1);
    expect(firstFoldSource).toContain('class="today-summary"');
    expect(firstFoldSource).toContain('quick-create-panel');
    expect(firstFoldSource).toContain('<WorkbenchGrowth expanded />');
    expect(resourceOverviewStart).toBeGreaterThan(firstFoldEnd);
    expect(desktopSource).toMatch(
      /\.workbench-first-fold\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.65fr\) minmax\(340px, 1fr\)/,
    );
    expect(desktopSource).toMatch(
      /\.workbench-first-fold__rail\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\)[\s\S]*?align-content:\s*stretch/,
    );
    expect(desktopSource).toMatch(/\.workbench-first-fold__rail :deep\(\.growth-card\)\s*\{[\s\S]*?height:\s*100%/);
    expect(desktopSource).toMatch(/\.quick-create-panel\s*\{[\s\S]*?height:\s*auto/);
  });

  it('1200–1399 宽桌面仍保留首屏右侧栏，不提前折叠成类移动布局', () => {
    expect(desktopSource).toContain('@media (max-width: 1199px)');
    expect(desktopSource).not.toContain('@media (max-width: 1380px)');
    expect(desktopSource).toMatch(
      /@media \(max-width: 1199px\)\s*\{[\s\S]*?\.workbench-first-fold\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
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

  it('待处理空态复用通用快速创建入口', () => {
    expect(desktopSource).toContain(':show-empty-action="true"');
    expect(desktopSource).toContain('@quick-create="openQuickCapture()"');
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
    const firstFoldIndex = desktopSource.indexOf('<section class="workbench-first-fold">');
    const routineIndex = desktopSource.indexOf('<section class="workbench-routine-grid">');
    const reviewIndex = desktopSource.indexOf('<DailyReviewCard class="workbench-daily-review"');
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
    const routineStart = desktopSource.indexOf('<section class="workbench-routine-grid">');
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
    expect(desktopSource).toContain('<DailyReviewCard class="workbench-daily-review" :read-only="growthReadOnly" />');
    expect(desktopSource).not.toContain('height: 206px');
  });

  it('今日简报只在桌面布局加载，默认开启时由独立卡片按日确保生成', () => {
    const firstFoldIndex = desktopSource.indexOf('<section class="workbench-first-fold">');
    const briefIndex = desktopSource.indexOf('<DailyBriefCard');
    const reviewIndex = desktopSource.indexOf('<DailyReviewCard class="workbench-daily-review"');

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

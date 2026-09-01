import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopSource = readFileSync(resolve(process.cwd(), 'src/view/workbenches/DesktopWorkbenchView.vue'), 'utf8');

describe('桌面工作台头部布局稳定性', () => {
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
      /\.workbench-first-fold\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(330px, 0\.29fr\)/,
    );
    expect(desktopSource).toMatch(
      /\.workbench-first-fold__rail\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\)[\s\S]*?align-content:\s*stretch/,
    );
    expect(desktopSource).toMatch(/\.workbench-first-fold__rail :deep\(\.growth-card\)\s*\{[\s\S]*?height:\s*100%/);
    expect(desktopSource).toMatch(/\.quick-create-panel\s*\{[\s\S]*?height:\s*auto/);
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

  it('待处理明细与继续工作区域以 280px 为最小高度并允许内容自然增高', () => {
    expect(desktopSource).toMatch(/\.today-summary-details\s*\{[\s\S]*?min-height:\s*var\(--today-work-area-height\)/);
    expect(desktopSource).toMatch(/\.today-continue\s*\{[\s\S]*?min-height:\s*var\(--today-work-area-height\)/);
  });

  it('每日任务只展示进度，领取统一收口到上方我的成长卡', () => {
    expect(desktopSource).toContain(':show-claim-action="false"');
    expect(desktopSource).toContain('@go="handleDailyQuestAction"');
    expect(desktopSource).toContain('resolveDailyQuestRoute(key, false)');
    expect(desktopSource).not.toContain('@claim="claimDailyGrowth"');
    expect(desktopSource).not.toContain('function claimDailyGrowth');
  });

  it('首屏主次分栏后展示共享每日回顾，并让初始化与前台刷新共用回顾读模型', () => {
    const firstFoldIndex = desktopSource.indexOf('<section class="workbench-first-fold">');
    const reviewIndex = desktopSource.indexOf('<DailyReviewCard class="workbench-daily-review"');
    const growthTasksIndex = desktopSource.indexOf(
      '<section v-if="growthSectionLoading" class="growth-task-grid growth-task-grid--loading"',
    );

    expect(desktopSource).toContain("import DailyReviewCard from '@/components/workbenches/DailyReviewCard.vue'");
    expect(desktopSource).toContain("import { useDailyReview } from '@/composables/useDailyReview.ts'");
    expect(reviewIndex).toBeGreaterThan(firstFoldIndex);
    expect(reviewIndex).toBeLessThan(growthTasksIndex);
    expect(desktopSource).toContain(':read-only="growthReadOnly"');
    expect(desktopSource.match(/refreshDailyReview\(\)/g)).toHaveLength(3);
    expect(desktopSource).not.toContain('loadRecap');
  });

  it('继续处理默认最多展示五条，满五条时均分面板剩余高度', () => {
    expect(desktopSource).toContain('const CONTINUE_ITEM_LIMIT = 5;');
    expect(desktopSource).toContain('slice(0, CONTINUE_ITEM_LIMIT)');
    expect(desktopSource).toContain('activeContinueItems.length === CONTINUE_ITEM_LIMIT');
    expect(desktopSource).toMatch(
      /\.content-list--distributed\s*>\s*\.content-row,[\s\S]*?\.content-list--distributed\s*>\s*\.content-skeleton-row\s*\{[\s\S]*?flex:\s*1 1 0/,
    );
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopSource = readFileSync(resolve(process.cwd(), 'src/view/workbenches/DesktopWorkbenchView.vue'), 'utf8');

describe('桌面工作台头部布局稳定性', () => {
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

  it('继续处理默认最多展示五条，满五条时均分面板剩余高度', () => {
    expect(desktopSource).toContain('const CONTINUE_ITEM_LIMIT = 5;');
    expect(desktopSource).toContain('slice(0, CONTINUE_ITEM_LIMIT)');
    expect(desktopSource).toContain('activeContinueItems.length === CONTINUE_ITEM_LIMIT');
    expect(desktopSource).toMatch(
      /\.content-list--distributed\s*>\s*\.content-row,[\s\S]*?\.content-list--distributed\s*>\s*\.content-skeleton-row\s*\{[\s\S]*?flex:\s*1 1 0/,
    );
  });
});

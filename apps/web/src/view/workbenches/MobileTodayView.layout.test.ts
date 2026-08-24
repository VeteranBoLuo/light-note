import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/workbenches/MobileTodayView.vue'), 'utf8');

describe('移动端今日加载布局', () => {
  it('顶部总览与桌面端使用相同统计口径，并保留待整理短名称', () => {
    expect(source).toMatch(/key: 'todo'[\s\S]*?workbench\.today\.todoPending[\s\S]*?counts\.value\.todoPending/);
    expect(source).toMatch(/key: 'inbox'[\s\S]*?workbench\.mobileToday\.inbox[\s\S]*?counts\.value\.inbox/);
    expect(source).toMatch(
      /key: 'notification'[\s\S]*?workbench\.today\.unreadNotification[\s\S]*?counts\.value\.unreadNotification/,
    );
    expect(source).not.toContain("key: 'overdue' as const");
    expect(source).not.toContain("key: 'dueToday' as const");
  });

  it('未读通知入口进入移动端通知中心', () => {
    expect(source).toMatch(/key === 'notification'[\s\S]*?router\.push\(\{ name: 'notifications' \}\)/);
  });

  it('三项统计使用带语义图标的紧凑横向分段条', () => {
    expect(source).toMatch(/key: 'todo'[\s\S]*?icon: icon\.noteDetail\.toolbar\.todo/);
    expect(source).toMatch(/key: 'inbox'[\s\S]*?icon: icon\.contextMenu\.inbox/);
    expect(source).toMatch(/key: 'notification'[\s\S]*?icon: icon\.settings\.notification/);
    expect(source).toMatch(/\.mobile-today__summary-item\s*\{[^}]*height:\s*52px[^}]*flex-direction:\s*row/);
    expect(source).toMatch(
      /\.mobile-today__summary-label\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?text-overflow:\s*ellipsis/,
    );
    expect(source).not.toMatch(/\.mobile-today__summary-item\s*\{[^}]*flex-direction:\s*column/);
  });

  it('快速记录保持四列横排，继续处理收进一个带分隔线的列表容器', () => {
    expect(source).toMatch(
      /\.mobile-today__capture-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
    );
    expect(source).toContain('class="mobile-today__continue-list"');
    expect(source).toMatch(
      /\.mobile-today__capture-icon\s*\{[\s\S]*?place-items:\s*center[\s\S]*?color:\s*var\(--capture-accent[\s\S]*?line-height:\s*0/,
    );
    expect(source).toMatch(
      /\.mobile-today__capture-action\.is-note\s*\{[\s\S]*?--capture-accent:\s*var\(--resource-note-color/,
    );
    expect(source).toMatch(
      /\.mobile-today__capture-action\.is-note \.mobile-today__capture-icon\s*\{[\s\S]*?background:\s*color-mix\(in srgb, var\(--resource-note-color/,
    );
    expect(source).toMatch(
      /\.mobile-today__capture-action\.is-todo\s*\{[\s\S]*?--capture-accent:\s*var\(--todo-accent-color/,
    );
    expect(source).toMatch(
      /\.mobile-today__capture-action\.is-bookmark\s*\{[\s\S]*?--capture-accent:\s*var\(--resource-bookmark-color/,
    );
    expect(source).toMatch(
      /\.mobile-today__capture-action\.is-file\s*\{[\s\S]*?--capture-accent:\s*var\(--resource-file-color/,
    );
    expect(source).not.toContain('.mobile-today__capture-action span {');
    expect(source).toMatch(
      /\.mobile-today__continue-item \+ \.mobile-today__continue-item\s*\{[\s\S]*?border-top:\s*1px solid var\(--surface-divider-color\)/,
    );
  });

  it('继续处理下方展示移动端紧凑成长卡，不再用孤立的领奖提示条', () => {
    expect(source).toContain('<WorkbenchGrowth v-if="todaySettled" class="mobile-today__growth-card" compact-today />');
    expect(source).toContain("import WorkbenchGrowth from '@/components/workbenches/WorkbenchGrowth.vue'");
    expect(source).not.toContain('class="mobile-today__growth-claim"');
    expect(source).toContain(':show-claim-action="false"');
    expect(source).not.toContain('@claim="claimDailyGrowth"');
    expect(source).not.toContain('function claimDailyGrowth');
    expect(source).toMatch(/\.mobile-today__growth-card\s*\{[\s\S]*?margin:\s*14px 0/);
  });

  it('骨架分组与真实待处理列表一样不显示内层外框', () => {
    expect(source).toMatch(
      /\.mobile-today__pending-details :deep\(\.today-actions__skeleton-group\)[\s\S]*?border:\s*0[\s\S]*?border-radius:\s*0[\s\S]*?background:\s*transparent/,
    );
  });

  it('每日任务卡片与今日其他内容卡片共用统一描边和背景', () => {
    expect(source).toMatch(
      /\.mobile-today__growth\s*\{[\s\S]*?border:\s*1px solid var\(--surface-border-color\);[\s\S]*?background:\s*var\(--card-background\);/,
    );
  });

  it('触屏点击总结卡片不保留 hover、active 或焦点填充', () => {
    expect(source).toMatch(
      /\.mobile-today__summary-item:hover,[\s\S]*?\.mobile-today__summary-item:focus-visible[\s\S]*?outline:\s*none;[\s\S]*?opacity:\s*1 !important;[\s\S]*?box-shadow:\s*none;[\s\S]*?background:\s*transparent/,
    );
  });
});

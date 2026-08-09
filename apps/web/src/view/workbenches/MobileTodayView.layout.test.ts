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
});

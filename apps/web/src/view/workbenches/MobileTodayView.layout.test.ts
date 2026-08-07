import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/workbenches/MobileTodayView.vue'), 'utf8');

describe('移动端今日加载布局', () => {
  it('骨架分组与真实待处理列表一样不显示内层外框', () => {
    expect(source).toMatch(
      /\.mobile-today__pending-details :deep\(\.today-actions__skeleton-group\)[\s\S]*?border:\s*0[\s\S]*?border-radius:\s*0[\s\S]*?background:\s*transparent/,
    );
  });
});

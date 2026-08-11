import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/mobile/MobileBottomNav.vue'), 'utf8');

describe('移动端底部导航切换状态', () => {
  it('点击后立即切换选中态，但不展示额外加载点或位移动画', () => {
    expect(source).toContain("'mobile-bottom-nav__item--active': isItemActive(item.key) || pendingKey === item.key");
    expect(source).not.toContain('mobile-bottom-nav__item--pending');
    expect(source).not.toContain('mobile-navigation-pending');
  });
});

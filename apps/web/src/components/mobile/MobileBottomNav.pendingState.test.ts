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

  it('中间新建入口只显示居中的主操作图标，同时保留无障碍名称', () => {
    expect(source).toContain(`:aria-label="item.key === 'create' ? t(item.labelKey) : undefined"`);
    expect(source).toContain(`<span v-if="item.key !== 'create'" class="mobile-bottom-nav__label">`);
    expect(source).toContain('.mobile-bottom-nav__item--create {');
    expect(source).toContain('position: relative;');
    expect(source).toContain('.mobile-bottom-nav__item--create .mobile-bottom-nav__icon {');
    expect(source).toContain('top: 50%;');
    expect(source).toContain('transform: translate(-50%, -50%);');
    expect(source).not.toContain('.mobile-bottom-nav__item--create .mobile-bottom-nav__label {');
    expect(source).not.toContain('margin-top: -5px;');
  });
});

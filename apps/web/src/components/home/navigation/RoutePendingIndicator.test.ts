import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import type { RouteLocationNormalized } from 'vue-router';
import RoutePendingIndicator from './RoutePendingIndicator.vue';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

const messages = {
  routePending: { opening: '正在打开', openingPage: '正在打开页面', slow: '网络有点慢，仍在打开' },
  navigation: { todo: '待办', note: '笔记' },
  mobileNavigation: { community: '社区' },
};

function mount(name: string, slow = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const target = { name, path: `/${name}`, matched: [], query: {}, params: {} } as unknown as RouteLocationNormalized;
  const app = createApp({ render: () => h(RoutePendingIndicator, { target, slow }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': messages } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host.querySelector<HTMLElement>('.route-pending')!;
}

describe('RoutePendingIndicator', () => {
  it('常用入口显示模块图标、语义色与“正在打开待办”，并作为状态区域朗读', () => {
    const root = mount('inbox');
    expect(root.getAttribute('role')).toBe('status');
    expect(root.querySelector('.route-pending__label')?.textContent?.replace(/\s+/g, '')).toBe('正在打开待办');
    expect(root.querySelector('.route-pending__module')).not.toBeNull();
    expect(root.style.getPropertyValue('--route-pending-color')).toBe('var(--todo-module-color)');
    expect(root.querySelectorAll('.route-pending__petal')).toHaveLength(4);
  });

  it('笔记详情归入笔记，社区各页归入社区，社区后台不冒充社区入口', () => {
    expect(mount('noteDetail').textContent).toContain('笔记');
    cleanup?.();
    expect(mount('communityChat').textContent).toContain('社区');
    cleanup?.();
    const admin = mount('communityChatModerationAdmin');
    expect(admin.querySelector('.route-pending__module')).toBeNull();
    expect(admin.textContent).toContain('正在打开页面');
  });

  it('其他页面使用通用文案，超过 3 秒才显示慢网提示', () => {
    const root = mount('settings');
    expect(root.querySelector('.route-pending__module')).toBeNull();
    expect(root.textContent).toContain('正在打开页面');
    expect(root.classList.contains('is-slow')).toBe(false);
    cleanup?.();
    expect(mount('settings', true).classList.contains('is-slow')).toBe(true);
  });
});

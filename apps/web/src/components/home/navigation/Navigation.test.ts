import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(() => Promise.resolve()),
  refreshBookmarks: vi.fn(),
  refreshInbox: vi.fn(() => Promise.resolve()),
  resetInbox: vi.fn(),
}));

const bookmark = {
  isMobile: false,
  isFold: false,
  type: 'all',
  bookmarkSearch: '',
  refreshData: mocks.refreshBookmarks,
};

vi.mock('@/router', () => ({
  default: {
    push: mocks.routerPush,
  },
}));

vi.mock('vue-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('vue-router')>();
  return {
    ...original,
    useRoute: () => ({ path: '/home', name: 'home' }),
  };
});

const inbox = {
  todoAttentionTotal: 0,
  todoOverdueTotal: 0,
  todoDueTodayTotal: 0,
  resetForOwner: mocks.resetInbox,
  refreshCount: mocks.refreshInbox,
};

const user = { id: '', role: 'visitor' };

vi.mock('@/store', () => ({
  bookmarkStore: () => bookmark,
  inboxStore: () => inbox,
  useUserStore: () => user,
}));

vi.mock('@/components/home/navigation/RightArea.vue', () => ({
  default: { name: 'RightAreaStub', template: '<div></div>' },
}));

const { default: Navigation } = await import('./Navigation.vue');

let cleanup: (() => void) | undefined;

async function mountNavigation() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Navigation);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.directive('click-log', {});
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.routerPush.mockClear();
  user.role = 'visitor';
  bookmark.isFold = false;
  inbox.todoAttentionTotal = 0;
  inbox.todoOverdueTotal = 0;
  inbox.todoDueTodayTotal = 0;
});

describe('Navigation', () => {
  it('PC 应用内点击 Logo 进入稳定应用入口，而不是返回官网', async () => {
    const host = await mountNavigation();
    const logo = host.querySelector<HTMLElement>('.navigation-title-link');

    expect(logo).not.toBeNull();
    logo?.click();
    await Promise.resolve();
    await nextTick();

    expect(mocks.routerPush).toHaveBeenCalledWith('/app');
    expect(bookmark.isFold).toBe(true);
  });

  /**
   * 待办是唯一挂注意力角标的导航项，口径是「逾期 + 今天到期」。
   * 颜色分档必须由 overdue 是否为 0 决定：有历史逾期才是危险色。
   */
  describe('待办注意力角标', () => {
    it('没有需要关注的待办时不渲染角标', async () => {
      const host = await mountNavigation();
      expect(host.querySelector('.navigation-attention-badge')).toBeNull();
    });

    it('有逾期时显示总数并使用危险色档位', async () => {
      inbox.todoAttentionTotal = 3;
      inbox.todoOverdueTotal = 1;
      inbox.todoDueTodayTotal = 2;

      const host = await mountNavigation();
      const badge = host.querySelector<HTMLElement>('.navigation-attention-badge');

      expect(badge?.textContent?.trim()).toBe('3');
      // 默认档位即危险色，不额外挂 is-due-today
      expect(badge?.classList.contains('is-due-today')).toBe(false);
      expect(badge?.getAttribute('aria-label')).toBe('3 项待办需要关注：逾期 1 项，今天到期 2 项');
    });

    it('只有今天到期、没有历史逾期时降一档为警示色', async () => {
      inbox.todoAttentionTotal = 2;
      inbox.todoOverdueTotal = 0;
      inbox.todoDueTodayTotal = 2;

      const host = await mountNavigation();
      const badge = host.querySelector<HTMLElement>('.navigation-attention-badge');

      expect(badge?.textContent?.trim()).toBe('2');
      expect(badge?.classList.contains('is-due-today')).toBe(true);
    });

    it('超过两位数收敛为 99+，不撑开导航', async () => {
      inbox.todoAttentionTotal = 128;
      inbox.todoOverdueTotal = 100;
      inbox.todoDueTodayTotal = 28;

      const host = await mountNavigation();

      expect(host.querySelector('.navigation-attention-badge')?.textContent?.trim()).toBe('99+');
    });

    /** 角标只能挂在待办上：资源中心的待整理属于低时效库存，不做常驻催办。 */
    it('角标只出现在待办入口，资源中心不带角标', async () => {
      inbox.todoAttentionTotal = 2;
      inbox.todoOverdueTotal = 1;
      inbox.todoDueTodayTotal = 1;

      const host = await mountNavigation();

      expect(host.querySelectorAll('.navigation-attention-badge')).toHaveLength(1);
      expect(host.querySelector('.navigation-todo-entry .navigation-attention-badge')).not.toBeNull();
    });
  });

  /**
   * 管理是 root 单入口：知识库/通知中心/安全中心已经在 /admin 的侧边导航里，
   * 顶部不再挂下拉，点一次直达后台总览。锁住的是「入口存在且只有一跳」。
   */
  describe('管理入口', () => {
    it('非 root 看不到管理入口', async () => {
      const host = await mountNavigation();
      expect(host.querySelector('#nav-admin-entry')).toBeNull();
    });

    it('root 点击管理直接进后台总览', async () => {
      user.role = 'root';

      const host = await mountNavigation();
      const entry = host.querySelector<HTMLElement>('#nav-admin-entry');

      expect(entry?.textContent?.trim()).toBe('管理');
      entry?.click();
      await nextTick();

      expect(mocks.routerPush).toHaveBeenCalledWith('/admin');
    });
  });
});

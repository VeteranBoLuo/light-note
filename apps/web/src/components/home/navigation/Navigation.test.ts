import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
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
const communityUnreadTotal = ref(0);

vi.mock('@/store', () => ({
  bookmarkStore: () => bookmark,
  inboxStore: () => inbox,
  useUserStore: () => user,
}));

vi.mock('@/composables/useCommunityChatUnread', () => ({
  useCommunityChatUnread: () => ({
    totalUnread: communityUnreadTotal,
  }),
}));

vi.mock('@/components/home/navigation/RightArea.vue', () => ({
  default: { name: 'RightAreaStub', template: '<div></div>' },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: {
    name: 'SvgIconStub',
    props: ['src'],
    template: '<i class="svg-icon-stub" :data-src="src"></i>',
  },
}));

const { default: Navigation } = await import('./Navigation.vue');
const navigationSource = readFileSync(resolve(process.cwd(), 'src/components/home/navigation/Navigation.vue'), 'utf8');
const rightAreaSource = readFileSync(resolve(process.cwd(), 'src/components/home/navigation/RightArea.vue'), 'utf8');
const themeSource = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.less'), 'utf8');

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
  user.id = '';
  communityUnreadTotal.value = 0;
  bookmark.isFold = false;
  inbox.todoAttentionTotal = 0;
  inbox.todoOverdueTotal = 0;
  inbox.todoDueTodayTotal = 0;
});

describe('Navigation', () => {
  it('聊天室入口默认弱化为普通导航，hover 轻量反馈且仅选中态保留完整 tonal 胶囊', () => {
    expect(navigationSource).toContain('background: var(--navigation-community-bg) !important');
    expect(navigationSource).toContain('color: var(--navigation-community-hover-fg)');
    expect(navigationSource).toContain('background: var(--navigation-community-hover-bg) !important');
    expect(navigationSource).toContain('color: var(--navigation-community-active-fg)');
    expect(navigationSource).toContain('background: var(--navigation-community-active-bg) !important');
    expect(navigationSource).not.toContain('transform: translateY(-1px)');
    expect(navigationSource).not.toMatch(/navigation-community-entry\.is-active\s*\{[^}]*color:\s*#fff/su);
    expect(themeSource.match(/--navigation-community-bg:\s*transparent/gu)).toHaveLength(2);
    expect(themeSource.match(/--navigation-community-active-bg:/gu)).toHaveLength(2);
  });

  it('PC 顶栏用带文字的聊天室入口直达公共空间，并显示未读角标', async () => {
    user.id = 'user-1';
    user.role = 'user';
    communityUnreadTotal.value = 8;
    const host = await mountNavigation();
    const entry = host.querySelector<HTMLButtonElement>('#nav-community-entry');

    expect(entry?.textContent).toContain('聊天室');
    expect(entry?.querySelector('.navigation-community-entry__badge')?.textContent?.trim()).toBe('8');
    expect(entry?.getAttribute('aria-label')).toContain('8');

    entry?.click();
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/community-chat');
  });

  it('PC 顶栏按待办、标签、资源中心、聊天室的顺序提供一级入口', async () => {
    const host = await mountNavigation();
    const navigationItems = Array.from(host.querySelector('.navigation-tab')?.children || []);
    const todoEntry = host.querySelector('#nav-todo-entry');
    const tagEntry = host.querySelector('#nav-tag-entry');
    const resourceCenterEntry = host.querySelector('#nav-resource-center-entry');
    const communityEntry = host.querySelector('#nav-community-entry');

    expect(todoEntry).not.toBeNull();
    expect(tagEntry?.textContent?.trim()).toBe('标签');
    expect(resourceCenterEntry?.textContent?.trim()).toBe('资源中心');
    expect(communityEntry).not.toBeNull();
    expect(navigationItems.indexOf(tagEntry as Element)).toBe(navigationItems.indexOf(todoEntry as Element) + 1);
    expect(navigationItems.indexOf(resourceCenterEntry as Element)).toBe(
      navigationItems.indexOf(tagEntry as Element) + 1,
    );
    expect(navigationItems.indexOf(communityEntry as Element)).toBe(
      navigationItems.indexOf(resourceCenterEntry as Element) + 1,
    );

    tagEntry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/manage/tagMg');

    resourceCenterEntry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/search');
  });

  it('标签和资源中心提升为一级入口后不再重复出现在更多菜单', () => {
    expect(rightAreaSource).not.toContain("label: t('navigation.resourceCenter')");
    expect(rightAreaSource).not.toContain("label: t('navigation.tag')");
    expect(rightAreaSource).not.toContain('function resourceCenterClick');
    expect(rightAreaSource).not.toContain('function tagManageClick');
  });

  it('PC 顶栏保留书签、笔记和云空间三个高频资料入口，可一键切换', async () => {
    const host = await mountNavigation();

    expect(host.querySelector('#nav-bookmark-entry')?.textContent?.trim()).toBe('书签');
    expect(host.querySelector('#nav-note-entry')?.textContent?.trim()).toBe('笔记');
    expect(host.querySelector('#nav-cloud-entry')?.textContent?.trim()).toBe('云空间');
    expect(host.querySelector('#nav-tag-entry')?.textContent?.trim()).toBe('标签');
    expect(host.querySelector('#nav-resource-center-entry')?.textContent?.trim()).toBe('资源中心');

    host.querySelector<HTMLElement>('#nav-bookmark-entry')?.click();
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/home');

    host.querySelector<HTMLElement>('#nav-note-entry')?.click();
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/noteLibrary');

    host.querySelector<HTMLElement>('#nav-cloud-entry')?.click();
    await nextTick();
    expect(mocks.routerPush).toHaveBeenCalledWith('/cloudSpace');
  });

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

  /** 顶栏只保留一个管理入口；服务器管理由后台左侧导航承接。 */
  describe('管理入口', () => {
    it('非 root 看不到管理入口', async () => {
      const host = await mountNavigation();
      expect(host.querySelector('#nav-admin-entry')).toBeNull();
    });

    it('root 点击管理直接进入后台，不再渲染二级下拉', async () => {
      user.role = 'root';

      const host = await mountNavigation();
      const entry = host.querySelector<HTMLButtonElement>('#nav-admin-entry');

      expect(entry?.textContent?.trim()).toBe('管理');
      expect(entry?.hasAttribute('aria-haspopup')).toBe(false);
      entry?.click();
      await nextTick();
      expect(mocks.routerPush).toHaveBeenCalledWith('/admin');
      expect(document.querySelector('.b-dropdown-menu')).toBeNull();
    });

    it('选中态只改变文字颜色，不绘制额外底边', () => {
      const activeOnlyRule = navigationSource.match(/\.navigation-management-entry\.is-active\s*\{([^}]*)\}/u)?.[1] || '';

      expect(navigationSource).toContain('.navigation-management-entry:hover,\n  .navigation-management-entry.is-active');
      expect(activeOnlyRule).not.toMatch(/box-shadow|border-bottom/u);
    });
  });
});

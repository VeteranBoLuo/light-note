import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import ResourceCenterSectionNav from './ResourceCenterSectionNav.vue';
import useInboxStore from '@/store/inbox';

const mocks = vi.hoisted(() => ({ recordOperation: vi.fn() }));

vi.mock('@/api/commonApi', () => ({
  recordOperation: mocks.recordOperation,
}));

let cleanup: (() => void) | undefined;

async function mountNav(
  initialPath: string,
  countState: Partial<Pick<ReturnType<typeof useInboxStore>, 'pendingTotal' | 'countReady' | 'countFailed'>> = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const inbox = useInboxStore(pinia);
  Object.assign(inbox, countState);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', component: { render: () => null } },
      { path: '/inbox', component: { render: () => null } },
      { path: '/organize', component: { render: () => null } },
    ],
  });
  await router.push(initialPath);
  await router.isReady();

  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(ResourceCenterSectionNav) });
  app.component('OriginalIcon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  app.component('svg-icon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  app.use(pinia);
  app.use(router);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          resourceCenter: {
            title: '资源中心',
            sections: { resources: '查找', organize: '整理中心' },
            knowledgeGraph: '全局图谱',
            knowledgeGraphShort: '图谱',
          },
          inbox: {
            pendingSummary: '还有 {count} 项待整理',
          },
        },
      },
    }),
  );
  app.mount(host);
  await nextTick();

  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, router, inbox };
}

async function settleNavigation() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.recordOperation.mockReset();
});

describe('ResourceCenterSectionNav', () => {
  it('桌面端将查找、整理中心和全局图谱作为同级页签', async () => {
    const { host } = await mountNav('/search?section=map');
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    const mapButton = host.querySelector<HTMLButtonElement>('.knowledge-map-view');

    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(mapButton?.getAttribute('role')).toBe('tab');
    expect(tabs[0].textContent?.trim()).toBe('查找');
    expect(mapButton?.getAttribute('aria-label')).toBe('全局图谱');
    expect(mapButton?.getAttribute('aria-selected')).toBe('true');
  });

  it('整理中心位于查找与全局图谱之间，并能切换到全局图谱', async () => {
    const { host, router } = await mountNav('/organize?issue=pending');
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const mapButton = host.querySelector<HTMLButtonElement>('.knowledge-map-view')!;

    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    mapButton.click();
    await settleNavigation();

    expect(router.currentRoute.value.fullPath).toBe('/search?section=map');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(mapButton.getAttribute('aria-selected')).toBe('true');

    mapButton.click();
    await settleNavigation();
    expect(router.currentRoute.value.fullPath).toBe('/search?section=map');
  });

  it('移动端把三个一级入口纳入同一组三段式导航', async () => {
    const { host } = await mountNav('/search?section=map');
    const tablist = host.querySelector<HTMLElement>('.resource-center-section-bar');
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');

    expect(tablist?.getAttribute('role')).toBe('tablist');
    expect(tabs).toHaveLength(3);
    expect(Array.from(tabs).map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
  });

  it('只在待整理数量权威且大于零时显示语义角标，并实时同步数量', async () => {
    const { host, inbox } = await mountNav('/search', { pendingTotal: 1, countReady: true, countFailed: false });
    const badge = host.querySelector<HTMLElement>('.organize-pending-badge')!;

    expect(badge.classList.contains('is-hidden')).toBe(false);
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge.getAttribute('aria-label')).toBe('还有 1 项待整理');
    expect(badge.textContent?.trim()).toBe('1');

    inbox.pendingTotal = 120;
    await nextTick();
    expect(badge.textContent?.trim()).toBe('99+');

    inbox.pendingTotal = 0;
    await nextTick();
    expect(badge.classList.contains('is-hidden')).toBe(true);
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(badge.getAttribute('role')).toBeNull();
  });

  it('首次加载和最近一次计数失败时隐藏角标，不展示旧数字或占位符', async () => {
    const { host, inbox } = await mountNav('/organize', { pendingTotal: 8, countReady: false });
    const badge = host.querySelector<HTMLElement>('.organize-pending-badge')!;

    expect(badge.classList.contains('is-hidden')).toBe(true);
    expect(badge.textContent?.trim()).toBe('');

    inbox.countReady = true;
    inbox.countFailed = true;
    await nextTick();
    expect(badge.classList.contains('is-hidden')).toBe(true);

    inbox.countFailed = false;
    await nextTick();
    expect(badge.classList.contains('is-hidden')).toBe(false);
    expect(badge.textContent?.trim()).toBe('8');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import ResourceCenterSectionNav from './ResourceCenterSectionNav.vue';

const mocks = vi.hoisted(() => ({
  bookmark: { isMobile: false },
  inbox: { pendingTotal: 0 },
  recordOperation: vi.fn(),
}));

vi.mock('@/store', () => ({
  bookmarkStore: () => mocks.bookmark,
  inboxStore: () => mocks.inbox,
}));

vi.mock('@/api/commonApi', () => ({
  recordOperation: mocks.recordOperation,
}));

let cleanup: (() => void) | undefined;

async function mountNav(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', component: { render: () => null } },
      { path: '/inbox', component: { render: () => null } },
    ],
  });
  await router.push(initialPath);
  await router.isReady();

  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(ResourceCenterSectionNav) });
  app.component('OriginalIcon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  app.use(router);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          resourceCenter: {
            title: '资源中心',
            sections: { resources: '全部资源', pendingResources: '待整理' },
            knowledgeGraph: '知识地图',
            knowledgeGraphShort: '图谱',
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
  return { host, router };
}

async function settleNavigation() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.bookmark.isMobile = false;
  mocks.inbox.pendingTotal = 0;
  mocks.recordOperation.mockReset();
});

describe('ResourceCenterSectionNav', () => {
  it('只把资源范围作为页签，并将知识地图标记为独立查看方式', async () => {
    const { host } = await mountNav('/search?section=map');
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    const mapButton = host.querySelector<HTMLButtonElement>('.knowledge-map-view');

    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(mapButton?.getAttribute('role')).toBeNull();
    expect(mapButton?.getAttribute('aria-label')).toBe('知识地图');
    expect(mapButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('从待整理进入和退出知识地图时保持范围与查看状态一致', async () => {
    const { host, router } = await mountNav('/inbox');
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const mapButton = host.querySelector<HTMLButtonElement>('.knowledge-map-view')!;

    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    mapButton.click();
    await settleNavigation();

    expect(router.currentRoute.value.fullPath).toBe('/search?section=map');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(mapButton.getAttribute('aria-pressed')).toBe('true');

    mapButton.click();
    await settleNavigation();

    expect(router.currentRoute.value.fullPath).toBe('/search');
    expect(mapButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('移动端把知识地图纳入三段式单选导航', async () => {
    mocks.bookmark.isMobile = true;
    const { host } = await mountNav('/search?section=map');
    const tablist = host.querySelector<HTMLElement>('.resource-center-section-bar');
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');

    expect(tablist?.getAttribute('role')).toBe('tablist');
    expect(tabs).toHaveLength(3);
    expect(Array.from(tabs).map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import ResourceCenterSectionNav from './ResourceCenterSectionNav.vue';

const mocks = vi.hoisted(() => ({ recordOperation: vi.fn() }));

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
      { path: '/organize', component: { render: () => null } },
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
            sections: { resources: '全部资源', organize: '整理中心' },
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
  mocks.recordOperation.mockReset();
});

describe('ResourceCenterSectionNav', () => {
  it('桌面端将三个入口作为同级页签，知识地图不再是低存在感的独立按钮', async () => {
    const { host } = await mountNav('/search?section=map');
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    const mapButton = host.querySelector<HTMLButtonElement>('.knowledge-map-view');

    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(mapButton?.getAttribute('role')).toBe('tab');
    expect(mapButton?.getAttribute('aria-label')).toBe('知识地图');
    expect(mapButton?.getAttribute('aria-selected')).toBe('true');
  });

  it('整理中心位于全部资源与知识地图之间，并能切换到知识地图', async () => {
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
});

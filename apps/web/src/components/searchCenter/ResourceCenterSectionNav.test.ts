import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import ResourceCenterSectionNav from './ResourceCenterSectionNav.vue';
import useOrganizeStore from '@/store/organize';
import graphRoute from '@/router/modules/graph';

const source = readFileSync(resolve(process.cwd(), 'src/components/searchCenter/ResourceCenterSectionNav.vue'), 'utf8');

const mocks = vi.hoisted(() => ({
  recordOperation: vi.fn(),
  getOrganizeSummary: vi.fn(),
}));

vi.mock('@/api/commonApi', () => ({
  recordOperation: mocks.recordOperation,
}));
vi.mock('@/api/organizeApi', () => ({
  getOrganizeSummary: mocks.getOrganizeSummary,
}));

let cleanup: (() => void) | undefined;

async function mountNav(initialPath: string, countState?: { pending: number; findings: number }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const organizer = useOrganizeStore(pinia);
  organizer.ownerKey = 'visitor|visitor||';
  if (countState) {
    organizer.summary = {
      pendingShortcut: { state: 'ready', count: countState.pending, route: '/organize?issue=pending' },
      totals: {
        affectedResourceTotal: countState.findings,
        findingTotal: countState.findings,
        exact: true,
        hasMore: false,
      },
      issues: {},
      generatedAt: new Date().toISOString(),
    } as any;
  }
  mocks.getOrganizeSummary.mockResolvedValue({ status: 500 });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      graphRoute,
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
            sections: { resources: '查找', organize: '整理' },
          },
          organize: {
            attentionSummary: '资源整理共有 {count} 项待处理事项',
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
  return { host, router, organizer };
}

async function settleNavigation() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.clearAllMocks();
});

describe('ResourceCenterSectionNav', () => {
  it('历史图谱地址回到资源查找', async () => {
    const { host, router } = await mountNav('/graph');
    expect(router.currentRoute.value.path).toBe('/search');
    expect(router.currentRoute.value.query.section).toBeUndefined();
    expect(host.querySelector('[role="tab"]')?.getAttribute('aria-selected')).toBe('true');
  });

  it('只显示查找与整理中心，历史图谱参数仍选中查找', async () => {
    const { host } = await mountNav('/search?section=map');
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent?.trim()).toBe('查找');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('查找与整理中心可双向切换', async () => {
    const { host, router } = await mountNav('/organize?issue=pending');
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    tabs[0].click();
    await settleNavigation();
    expect(router.currentRoute.value.fullPath).toBe('/search');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    tabs[1].click();
    await settleNavigation();
    expect(router.currentRoute.value.fullPath).toBe('/organize');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('一级导航的相邻状态保留间距，选中面不叠加短下划线或角标描边', () => {
    expect(source).toContain('class="section-nav-item__icon"');
    expect(source).toMatch(/--b-chip-border:\s*transparent/);
    expect(source).toMatch(/\.resource-center-section-bar\s*\{[\s\S]*?gap:\s*4px;/);
    expect(source).toMatch(/\.section-nav-item:not\(\.active\):hover/);
    expect(source).toMatch(/\.section-nav-item\.active\s*\{[\s\S]*?border-color:\s*var\(--surface-border-color/);
    expect(source).not.toContain('.section-nav-item.active::after');
    expect(source).not.toContain('.section-nav-item :deep(svg)');
  });

  it('汇总待整理与资源治理事项，并实时同步角标', async () => {
    const { host, organizer } = await mountNav('/search', { pending: 1, findings: 5 });
    const badge = host.querySelector<HTMLElement>('.organize-attention-badge')!;

    expect(badge.classList.contains('is-hidden')).toBe(false);
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge.getAttribute('aria-label')).toBe('资源整理共有 6 项待处理事项');
    expect(badge.textContent?.trim()).toBe('6');

    organizer.summary!.totals.findingTotal = 120;
    await nextTick();
    expect(badge.textContent?.trim()).toBe('99+');

    organizer.summary!.pendingShortcut.count = 0;
    organizer.summary!.totals.findingTotal = 0;
    await nextTick();
    expect(badge.classList.contains('is-hidden')).toBe(true);
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(badge.getAttribute('role')).toBeNull();
  });

  it('摘要尚未加载时隐藏角标，加载后显示完整汇总值', async () => {
    const { host, organizer } = await mountNav('/organize');
    const badge = host.querySelector<HTMLElement>('.organize-attention-badge')!;

    expect(badge.classList.contains('is-hidden')).toBe(true);
    expect(badge.textContent?.trim()).toBe('');

    organizer.summary = {
      pendingShortcut: { state: 'ready', count: 8, route: '/organize?issue=pending' },
      totals: { findingTotal: 3 },
    } as any;
    await nextTick();
    expect(badge.classList.contains('is-hidden')).toBe(false);
    expect(badge.textContent?.trim()).toBe('11');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import ResourceCenterSectionNav from './ResourceCenterSectionNav.vue';
import useOrganizeStore from '@/store/organize';

const source = readFileSync(resolve(process.cwd(), 'src/components/searchCenter/ResourceCenterSectionNav.vue'), 'utf8');

const mocks = vi.hoisted(() => ({
  recordOperation: vi.fn(),
  getOrganizeSummary: vi.fn(),
  getOrganizeKnowledgeStructureSummary: vi.fn(),
}));

vi.mock('@/api/commonApi', () => ({
  recordOperation: mocks.recordOperation,
}));
vi.mock('@/api/organizeApi', () => ({
  getOrganizeSummary: mocks.getOrganizeSummary,
  getOrganizeKnowledgeStructureSummary: mocks.getOrganizeKnowledgeStructureSummary,
}));

let cleanup: (() => void) | undefined;

async function mountNav(initialPath: string, countState?: { pending: number; findings: number; knowledge: number }) {
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
    organizer.knowledgeStructureSummary = { findingCount: countState.knowledge } as any;
  }
  mocks.getOrganizeSummary.mockResolvedValue({ status: 500 });
  mocks.getOrganizeKnowledgeStructureSummary.mockResolvedValue({ status: 500 });
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
          organize: {
            attentionSummary: '整理中心共有 {count} 项待处理事项',
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

  it('一级导航的相邻状态保留间距，选中面不叠加短下划线或角标描边', () => {
    expect(source).toContain('class="section-nav-item__icon"');
    expect(source).toContain('class="knowledge-map-view__icon"');
    expect(source).toMatch(/--b-chip-border:\s*transparent/);
    expect(source).toMatch(/\.resource-center-section-bar\s*\{[\s\S]*?gap:\s*4px;/);
    expect(source).toMatch(/\.section-nav-item:not\(\.active\):hover,/);
    expect(source).toMatch(/\.section-nav-item\.active\s*\{[\s\S]*?border-color:\s*var\(--surface-border-color/);
    expect(source).not.toContain('.section-nav-item.active::after');
    expect(source).not.toContain('.knowledge-map-view.active::after');
    expect(source).not.toContain('.section-nav-item :deep(svg)');
  });

  it('汇总待整理、资源治理与知识结构事项，并实时同步角标', async () => {
    const { host, organizer } = await mountNav('/search', { pending: 1, findings: 5, knowledge: 16 });
    const badge = host.querySelector<HTMLElement>('.organize-attention-badge')!;

    expect(badge.classList.contains('is-hidden')).toBe(false);
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge.getAttribute('aria-label')).toBe('整理中心共有 22 项待处理事项');
    expect(badge.textContent?.trim()).toBe('22');

    organizer.summary!.totals.findingTotal = 120;
    await nextTick();
    expect(badge.textContent?.trim()).toBe('99+');

    organizer.summary!.pendingShortcut.count = 0;
    organizer.summary!.totals.findingTotal = 0;
    organizer.knowledgeStructureSummary!.findingCount = 0;
    await nextTick();
    expect(badge.classList.contains('is-hidden')).toBe(true);
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(badge.getAttribute('role')).toBeNull();
  });

  it('摘要尚未完整加载时隐藏角标，不把部分数字伪装成汇总值', async () => {
    const { host, organizer } = await mountNav('/organize');
    const badge = host.querySelector<HTMLElement>('.organize-attention-badge')!;

    expect(badge.classList.contains('is-hidden')).toBe(true);
    expect(badge.textContent?.trim()).toBe('');

    organizer.summary = {
      pendingShortcut: { state: 'ready', count: 8, route: '/organize?issue=pending' },
      totals: { findingTotal: 3 },
    } as any;
    await nextTick();
    expect(badge.classList.contains('is-hidden')).toBe(true);

    organizer.knowledgeStructureSummary = { findingCount: 2 } as any;
    await nextTick();
    expect(badge.classList.contains('is-hidden')).toBe(false);
    expect(badge.textContent?.trim()).toBe('13');
  });
});

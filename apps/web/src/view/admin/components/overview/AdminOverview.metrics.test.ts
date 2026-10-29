import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import AdminOverview from './AdminOverview.vue';

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), post: vi.fn(), push: vi.fn() }));
vi.mock('@/api/adminOverview', () => ({ getAdminOverviewSnapshot: mocks.snapshot }));
vi.mock('@/http/request.ts', () => ({ apiBasePost: mocks.post }));
vi.mock('@/router', () => ({ default: { push: mocks.push } }));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => key + (values ? ':' + JSON.stringify(values) : ''),
  }),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
vi.mock('@/components/admin/AdminDataPage.vue', () => ({
  default: {
    setup:
      (_: unknown, { slots }: any) =>
      () =>
        h('main', [slots.actions?.(), slots.default?.()]),
  },
}));
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({
  default: {
    props: ['title'],
    setup:
      (_: unknown, { slots }: any) =>
      () =>
        slots.default?.(),
  },
}));
vi.mock('./AdminGrowthTrendCard.vue', () => ({ default: { render: () => h('div') } }));
vi.mock('./AdminActiveUsersDrawer.vue', () => ({
  default: {
    props: ['open'],
    setup: (props: any) => () => h('output', { 'data-active-detail': '' }, String(props.open)),
  },
}));
vi.mock('./AdminRecentAdditions.vue', () => ({
  default: {
    props: ['filter'],
    setup: (props: any) => () => h('output', { 'data-recent-filter': '' }, JSON.stringify(props.filter)),
  },
}));

const snapshot = () => ({
  users: { today: 12, total: 1286 },
  active: { available: true, today: 64 },
  resources: {
    bookmarkToday: 52,
    noteToday: 24,
    fileToday: 10,
    bookmarkTotal: 1000,
    noteTotal: 200,
    fileTotal: 86,
    storageMb: 4096,
    trashMb: 126,
    trashCount: 8,
  },
  todos: { total: 3120, createdToday: 24, pending: 68, dueToday: 12, overdue: 3, completedToday: 18 },
  ai: { todayCount: 26, todayTokens: 32800 },
  system: { apiToday: 4218, apiBusinessErrorsToday: 8, apiInvalidRequestsToday: 5, apiServerErrorsToday: 0 },
  pending: { opinion: 3, security: 1 },
  generatedAt: '2026-10-29 14:32',
});
let cleanup: (() => void) | undefined;
async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(AdminOverview);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await settle();
  return host;
}
const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('button')].find((node) => node.textContent?.includes(label))!;

beforeEach(() => {
  mocks.snapshot.mockResolvedValue({ status: 200, data: snapshot() });
  mocks.post.mockImplementation(async (url: string) => ({
    status: 200,
    data: url.endsWith('Trend')
      ? { days: 7, granularity: 'day', trend: [] }
      : { items: [], total: 0, hasMore: false, nextCursor: null },
  }));
});
afterEach(() => {
  cleanup?.();
  vi.clearAllMocks();
});

describe('后台总览的真实指标与下钻', () => {
  it('首屏按真实数据展示活跃与资源汇总，并继续读取趋势和最近新增', async () => {
    const host = await mount();
    expect(button(host, 'adminWorkspace.active').textContent).toContain('64');
    expect(button(host, 'adminWorkspace.resources').textContent).toContain('86');
    expect(button(host, 'adminWorkspace.users').textContent).toContain('12');
    expect(button(host, 'adminWorkspace.todos').textContent).toContain('24');
    const resourceTotals = [...host.querySelectorAll('.ov-resource-breakdown strong')].map((node) => node.textContent);
    expect(resourceTotals).toEqual(['1,000', '200', '86']);
    const resourceToday = [...host.querySelectorAll('.ov-resource-breakdown small')].map((node) => node.textContent);
    expect(resourceToday).toEqual([
      'adminWorkspace.todayAdded:{"count":"52"}',
      'adminWorkspace.todayAdded:{"count":"24"}',
      'adminWorkspace.todayAdded:{"count":"10"}',
    ]);
    expect(mocks.snapshot).toHaveBeenCalledWith(true, { force: false });
    expect(mocks.post).toHaveBeenCalledWith('/api/common/getAdminOverviewTrend', { days: 7, hideInternal: true });
    expect(mocks.post.mock.calls.filter(([url]) => url.endsWith('Recent'))).toHaveLength(2);
    button(host, 'adminActivity.view').click();
    await settle();
    expect(host.querySelector('[data-active-detail]')?.textContent).toBe('true');
  });
  it('资源分项仍能下钻今日明细，筛选与请求一致', async () => {
    const host = await mount();
    button(host, 'navigation.bookmark').click();
    await settle();
    expect(host.querySelector('[data-recent-filter]')?.textContent).toBe(
      JSON.stringify({ period: 'today', type: 'bookmark' }),
    );
    expect(
      mocks.post.mock.calls.some(
        ([url, body]) =>
          url.endsWith('Recent') && body.period === 'today' && body.type === 'bookmark' && body.target === 'resource',
      ),
    ).toBe(true);
  });
  it('活跃统计不可用时显示未知和不可用原因，不把缺失数据显示成零', async () => {
    mocks.snapshot.mockResolvedValue({
      status: 200,
      data: { ...snapshot(), active: { available: false, today: null } },
    });
    const host = await mount();
    const active = button(host, 'adminWorkspace.active');
    expect(active.textContent).toContain('—');
    expect(active.textContent).toContain('adminActivity.unavailable');
  });
  it('刷新失败保留已有指标并允许重试', async () => {
    const host = await mount();
    mocks.snapshot.mockRejectedValueOnce(new Error('offline'));
    button(host, 'common.refresh').click();
    await settle();
    expect(button(host, 'adminWorkspace.active').textContent).toContain('64');
    expect(host.textContent).toContain('adminOverview.refreshFailed');
    button(host, 'adminOverview.retry').click();
    await settle();
    expect(host.textContent).not.toContain('adminOverview.refreshFailed');
  });
});

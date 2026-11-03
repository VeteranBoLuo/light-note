import { createApp, h, nextTick, reactive, ref, type App } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManorSummary } from '@/api/manorAdminApi';
import { createManorAdminFixture } from '@/e2e/manorAdminFixture';
import { manorAdminZh, manorAdminEn } from '@/i18n/locales/manorAdmin';
import AdminManorSummaryCard from './AdminManorSummaryCard.vue';

const api = vi.hoisted(() => ({ summary: vi.fn() }));
vi.mock('@/api/manorAdminApi', () => ({ getManorAdminSummary: api.summary }));
const report = (overrides: Partial<ManorSummary> = {}): ManorSummary => {
  const fixture = createManorAdminFixture();
  return {
    day: '2026-10-29',
    hideInternal: true,
    runtime: fixture.runtime,
    daily: fixture.overview().finances!.trend.map((row) => ({ ...row, net: row.issued - row.spent })),
    activeToday: 8,
    activityPartialToday: false,
    failures: [],
    ...overrides,
  };
};
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    await nextTick();
  }
};
let app: App | undefined;
let host: HTMLDivElement;
async function mount(initial = { hideInternal: true, mobile: false }) {
  host = document.createElement('div');
  document.body.append(host);
  const props = reactive(initial);
  const card = ref<InstanceType<typeof AdminManorSummaryCard> | null>(null);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/overview', component: { render: () => null } },
      { path: '/admin/manorManagement', component: { render: () => null } },
      { path: '/manorManagement', component: { render: () => null } },
    ],
  });
  await router.push('/overview');
  app = createApp({ render: () => h(AdminManorSummaryCard, { ...props, ref: card }) })
    .use(createPinia())
    .use(router)
    .use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: {
          'zh-CN': { manorAdmin: manorAdminZh },
          'en-US': { manorAdmin: manorAdminEn },
        },
      }),
    );
  app.mount(host);
  await settle();
  return { props, card, router };
}
const value = (label: string) =>
  [...host.querySelectorAll('.ov-manor-metric')]
    .find((node) => node.textContent?.includes(label))
    ?.querySelector('strong')?.textContent;
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((node) => node.textContent?.includes(label))!;
beforeEach(() => {
  api.summary.mockReset();
  api.summary.mockImplementation(async () => report());
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});

describe('总览庄园每日积分与活跃卡', () => {
  it('今日值与七日逐日明细一致，展开只使用已有摘要，管理入口携带同一筛选', async () => {
    const { props, router } = await mount();
    expect(value('今日积分消耗')).toBe('300');
    expect(value('今日净积分')).toBe('−100');
    expect(value('今日积分产出')).toBe('+200');
    expect(value('今日活跃人数')).toBe('8');
    expect(host.textContent).toContain('净回收');
    expect(host.textContent).not.toContain('北京时间 · 净积分');
    button('查看每日收支').click();
    await settle();
    expect(host.querySelectorAll('.table-row')).toHaveLength(7);
    expect(host.querySelector('.table-row')?.textContent).toContain('10-29');
    expect(api.summary).toHaveBeenCalledTimes(1);
    props.hideInternal = false;
    await settle();
    (host.querySelector('.ov-manor-header-link') as HTMLAnchorElement).click();
    await settle();
    expect(router.currentRoute.value.path).toBe('/admin/manorManagement');
    expect(router.currentRoute.value.query).toMatchObject({ internal: 'show', days: '7', tab: 'overview' });
  });
  it('没有积分收支仍可有庄园活跃，零值不显示为缺失，移动入口保持可用', async () => {
    api.summary.mockResolvedValue(
      report({ daily: report().daily!.map((row) => ({ ...row, issued: 0, spent: 0, net: 0 })) }),
    );
    const { router } = await mount({ hideInternal: true, mobile: true });
    expect(value('今日积分消耗')).toBe('0');
    expect(value('今日净积分')).toBe('0');
    expect(value('今日活跃人数')).toBe('8');
    expect(host.textContent).toContain('收支持平');
    button('查看每日收支').click();
    await settle();
    expect(host.querySelectorAll('.ov-manor-daily-list > li')).toHaveLength(7);
    (host.querySelector('.ov-manor-mobile-link') as HTMLAnchorElement).click();
    await settle();
    expect(router.currentRoute.value.path).toBe('/manorManagement');
  });
  it('活跃覆盖未知只影响人数；积分来源失败不抹掉可用活跃人数', async () => {
    api.summary.mockResolvedValue(report({ activeToday: null }));
    const { card } = await mount();
    expect(value('今日活跃人数')).toBe('—');
    expect(value('今日积分产出')).toBe('+200');
    expect(host.textContent).toContain('记录范围待确认');
    api.summary.mockResolvedValue(report({ daily: null, activeToday: 8, failures: ['finances'] }));
    await card.value!.refresh();
    await settle();
    expect(value('今日积分产出')).toBe('+200');
    expect(value('今日活跃人数')).toBe('8');
    expect(host.textContent).toContain('部分统计未更新');
  });
  it('刷新失败保留同口径快照，覆盖失效和跨日结果不回填旧统计', async () => {
    const { card } = await mount();
    api.summary.mockRejectedValueOnce(new Error('offline'));
    await card.value!.refresh();
    await settle();
    expect(value('今日活跃人数')).toBe('8');
    expect(host.textContent).toContain('显示上次结果');
    api.summary.mockResolvedValueOnce(
      report({ activeToday: null, runtime: { ...report().runtime, coverageStartedAt: null } }),
    );
    await card.value!.refresh();
    await settle();
    expect(value('今日活跃人数')).toBe('—');
    api.summary.mockResolvedValueOnce(report({ day: '2026-10-30', daily: null, failures: ['finances'] }));
    await card.value!.refresh();
    await settle();
    expect(value('今日积分产出')).toBe('—');
  });
  it('切换内部账号筛选会取消旧请求，迟到旧结果不能覆盖新范围', async () => {
    let resolveOld!: (value: ManorSummary) => void, resolveNew!: (value: ManorSummary) => void;
    api.summary
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve;
          }),
      );
    const { props } = await mount();
    const oldSignal = api.summary.mock.calls[0][1] as AbortSignal;
    props.hideInternal = false;
    await settle();
    expect(oldSignal.aborted).toBe(true);
    resolveNew(report({ hideInternal: false, activeToday: 10 }));
    await settle();
    resolveOld(report({ activeToday: 8 }));
    await settle();
    expect(value('今日活跃人数')).toBe('10');
  });
  it('鉴权失败立即清除原有数据', async () => {
    const { card } = await mount();
    api.summary.mockRejectedValueOnce({ status: 403 });
    await card.value!.refresh();
    await settle();
    expect(value('今日活跃人数')).toBe('—');
    expect(value('今日积分消耗')).toBe('—');
  });
});

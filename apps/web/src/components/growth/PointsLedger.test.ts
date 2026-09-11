import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/api/growthApi.ts', () => ({ default: { getPointsLog: get } }));
vi.mock('@/components/base/BasicComponents/BVirtualList.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['items', 'hasMore', 'loading'],
      emits: ['loadMore'],
      setup(props, { slots, emit }) {
        return () =>
          h(
            'div',
            {
              class: 'virtual-test',
              onScroll: () => {
                if (props.hasMore && !props.loading) emit('loadMore');
              },
            },
            props.items.map((item: any) => slots.default?.({ item })),
          );
      },
    }),
  };
});
import PointsLedger from './PointsLedger.vue';
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
const row = (id: number, delta = 1) => ({ id, delta, reason: 'checkin', createTime: '2026-09-08T04:00:00Z' });
const response = (rows: any[], hasMore = false, nextCursor: string | null = null) => ({
  status: 200,
  data: { rows, hasMore, nextCursor },
});
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PointsLedger, { settingsLayout: true });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.directive('click-log', {});
  app.mount(host);
  await flush();
}
beforeEach(() => get.mockReset());
afterEach(() => {
  app?.unmount();
  host?.remove();
});
describe('积分流水并发与分页', () => {
  it('筛选切换不接收旧请求回执', async () => {
    let resolveOld!: (x: any) => void;
    get.mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)));
    get.mockResolvedValueOnce(response([row(2, -2)]));
    await mount();
    const spent = [...host.querySelectorAll<HTMLElement>('[role=tab]')].find((b) =>
      b.textContent?.includes(zh.growth.pointsFilterSpent),
    );
    spent!.click();
    await flush();
    resolveOld(response([row(1, 10)]));
    await flush();
    expect(host.querySelectorAll('.ledger-row')).toHaveLength(1);
    expect(host.querySelector('.ledger-row strong')?.textContent?.trim()).toBe('-2');
    expect(get.mock.calls[1][1].filter).toBe('spent');
  });
  it('后续页用 cursor 追加；零变化明确显示 0', async () => {
    get.mockResolvedValueOnce(response([row(1, 0)], true, 'cursor1')).mockResolvedValueOnce(response([row(2, 2)]));
    await mount();
    expect(host.querySelector('.ledger-row strong')?.textContent?.trim()).toBe('0');
    host.querySelector('.virtual-test')!.dispatchEvent(new Event('scroll'));
    await flush();
    expect(host.querySelector('.ledger-more')).toBeNull();
    expect(get.mock.calls[1][1].cursor).toBe('cursor1');
    expect(host.querySelectorAll('.ledger-row')).toHaveLength(2);
  });
  it('分页失败保留已有流水并允许重试同一 cursor', async () => {
    get
      .mockResolvedValueOnce(response([row(1)], true, 'cursor1'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response([row(2)]));
    await mount();
    host.querySelector('.virtual-test')!.dispatchEvent(new Event('scroll'));
    await flush();
    expect(host.querySelectorAll('.ledger-row')).toHaveLength(1);
    expect(host.querySelector('.ledger-all')).toBeNull();
    (host.querySelector('.ledger-page-error button') as HTMLButtonElement).click();
    await flush();
    expect(get.mock.calls[2][1].cursor).toBe('cursor1');
    expect(host.querySelectorAll('.ledger-row')).toHaveLength(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zh from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getAcquisitions: vi.fn(),
  user: { id: 'one', adminContext: null },
}));
vi.mock('@/store', async () => {
  const { reactive } = await import('vue');
  mocks.user = reactive(mocks.user);
  return { useUserStore: () => mocks.user, bookmarkStore: () => ({ isMobile: false }) };
});
vi.mock('@/api/growthApi', () => ({
  getLotteryHistory: mocks.getHistory,
  getInventoryAcquisitions: mocks.getAcquisitions,
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    props: ['open'],
    setup:
      (props: any, { slots }: any) =>
      () =>
        props.open ? h('div', slots.default()) : null,
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
import LotteryRecords from './LotteryRecords.vue';
let cleanup: (() => void) | undefined;
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};
const record = (id: string, n = 1) => ({
  id,
  mode: 'free',
  cost: 0,
  createdAt: '2026-10-23T02:14:00Z',
  results: Array.from({ length: n }, (_, i) => ({ id: 'ai', kind: 'ai_pack', amount: 100000, guaranteed: i === 9 })),
});
const response = (rows: any[], hasMore = false) => ({
  status: 200,
  data: { rows, hasMore, nextCursor: hasMore ? 'next' : null },
});
function setListSize(list: HTMLElement, height: number, contentHeight: number) {
  Object.defineProperties(list, {
    clientHeight: { configurable: true, value: height },
    scrollHeight: { configurable: true, value: contentHeight },
  });
}
async function mount(inventory = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(LotteryRecords, { inventory });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.directive('auto-scrollbar', {});
  const component = app.mount(host) as unknown as { open: (id?: string) => void };
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await flush();
  return { host, component };
}
beforeEach(() => {
  mocks.user.id = 'one';
  mocks.getHistory.mockReset();
  mocks.getHistory.mockResolvedValue(response([record('1')]));
  mocks.getAcquisitions.mockReset();
  mocks.getAcquisitions.mockResolvedValue(response([]));
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

describe('抽奖记录读取与展开', () => {
  it('背包读取全部渠道，来源与资产去向清楚，按资产筛选不调用抽奖接口', async () => {
    const gains = [
      { ...record('card'), source: 'admin', results: [{ id: 'card', kind: 'card', amount: 2 }] },
      { ...record('ai'), source: 'campaign' },
      { ...record('storage'), source: 'shop', results: [{ id: 'space', kind: 'storage', amount: 512 }] },
    ];
    mocks.getAcquisitions.mockImplementation((query) =>
      Promise.resolve(
        response(
          query.kind && query.kind !== 'all' ? gains.filter((row) => row.results[0].kind === query.kind) : gains,
        ),
      ),
    );
    const { host, component } = await mount(true);
    expect(host.textContent).toContain('获得来源');
    for (const label of ['管理员发放', '活动奖励', '积分兑换', '已入背包', '已计入永久余额', '已生效']) {
      expect(host.textContent).toContain(label);
    }
    expect(mocks.getHistory).not.toHaveBeenCalled();
    component.open();
    await flush();
    host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click();
    await flush();
    expect(mocks.getAcquisitions).toHaveBeenLastCalledWith({ limit: 20, kind: 'ai_pack', cursor: null });
    expect(host.querySelectorAll('.lr-list .lr-receipt')).toHaveLength(1);
    expect(host.querySelector('.lr-list')?.textContent).toContain('活动奖励');
    expect(host.querySelector('.lr-list')?.textContent).not.toContain('管理员发放');
  });
  it('接口响应不完整时展示失败重试，不把错误当作空历史', async () => {
    mocks.getAcquisitions.mockResolvedValue({ status: 200, data: {} });
    const { host } = await mount(true);
    expect(host.textContent).toContain('获得记录加载失败');
    expect(host.textContent).not.toContain('暂无可追溯');
  });
  it('按次展示十连摘要，展开后显示十项与真实保底', async () => {
    mocks.getHistory.mockResolvedValue(response([record('1', 10)]));
    const { host, component } = await mount();
    component.open();
    await flush();
    const expand = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('展开 10'),
    )!;
    expect(expand).toBeTruthy();
    expand.click();
    await nextTick();
    expect(host.querySelectorAll('.lr-details li')).toHaveLength(10);
    expect(host.querySelector('.lr-details li:last-child')?.textContent).toContain('保底命中');
  });
  it('快速切换筛选时忽略迟到的全部记录响应', async () => {
    const { host, component } = await mount();
    let resolveOld!: (value: unknown) => void;
    mocks.getHistory.mockImplementation((query) =>
      query.mode === 'all'
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(response([record('free')])),
    );
    component.open();
    await nextTick();
    host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    await flush();
    expect(mocks.getHistory).toHaveBeenLastCalledWith({ limit: 20, mode: 'free', cursor: null });
    resolveOld(response([record('stale', 10)]));
    await flush();
    expect(host.querySelector('.lr-list')?.textContent).not.toContain('展开 10');
  });
  it('从最近十连重新打开时恢复全部筛选并展开指定记录', async () => {
    mocks.getHistory.mockResolvedValue(response([record('ten', 10)]));
    const { host, component } = await mount();
    component.open();
    await flush();
    host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    await flush();
    component.open('ten');
    await flush();
    expect(mocks.getHistory).toHaveBeenLastCalledWith({ limit: 20, mode: 'all', cursor: null });
    expect(host.querySelectorAll('.lr-details li')).toHaveLength(10);
  });
  it('追加失败保留已有记录，停止自动续页并允许重试', async () => {
    const { host, component } = await mount();
    mocks.getHistory.mockResolvedValueOnce(response([record('first')], true));
    component.open();
    await flush();
    mocks.getHistory.mockRejectedValueOnce(new Error('offline'));
    const list = host.querySelector<HTMLElement>('.lr-list')!;
    setListSize(list, 500, 600);
    list.dispatchEvent(new Event('scroll'));
    await flush();
    expect(list.querySelectorAll('.lr-receipt')).toHaveLength(1);
    expect(list.textContent).toContain('抽奖记录加载失败');
    const calls = mocks.getHistory.mock.calls.length;
    list.dispatchEvent(new Event('scroll'));
    await flush();
    expect(mocks.getHistory).toHaveBeenCalledTimes(calls);
    mocks.getHistory.mockResolvedValueOnce(response([record('next')]));
    list.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await flush();
    expect(list.querySelectorAll('.lr-receipt')).toHaveLength(2);
    expect(mocks.getHistory).toHaveBeenLastCalledWith({ limit: 20, mode: 'all', cursor: 'next' });
  });
  it('每页只取 20 条，接近末尾才续页，滚动并发不会重复请求或重复展示', async () => {
    const { host, component } = await mount();
    mocks.getHistory.mockResolvedValueOnce(
      response(
        Array.from({ length: 20 }, (_, i) => record(String(i))),
        true,
      ),
    );
    component.open();
    await flush();
    expect(mocks.getHistory).toHaveBeenLastCalledWith({ limit: 20, mode: 'all', cursor: null });
    expect(host.querySelectorAll('.lr-list .lr-receipt')).toHaveLength(20);
    const list = host.querySelector<HTMLElement>('.lr-list')!;
    setListSize(list, 500, 2000);
    const calls = mocks.getHistory.mock.calls.length;
    list.dispatchEvent(new Event('scroll'));
    await flush();
    expect(mocks.getHistory).toHaveBeenCalledTimes(calls);
    let resolveNext!: (value: unknown) => void;
    mocks.getHistory.mockImplementationOnce(() => new Promise((resolve) => (resolveNext = resolve)));
    list.scrollTop = 1400;
    list.dispatchEvent(new Event('scroll'));
    list.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(mocks.getHistory).toHaveBeenCalledTimes(calls + 1);
    expect(mocks.getHistory).toHaveBeenLastCalledWith({ limit: 20, mode: 'all', cursor: 'next' });
    resolveNext(response([record('19'), record('20')]));
    await flush();
    expect(list.querySelectorAll('.lr-receipt')).toHaveLength(21);
    expect(list.textContent).toContain('已显示全部抽奖记录');
    list.dispatchEvent(new Event('scroll'));
    await flush();
    expect(mocks.getHistory).toHaveBeenCalledTimes(calls + 1);
  });
  it('首屏不足以滚动时自动补下一页，不要求用户先产生滚动事件', async () => {
    const { host, component } = await mount();
    let resolveFirst!: (value: unknown) => void;
    mocks.getHistory
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(response([record('second')]));
    component.open();
    await nextTick();
    const list = host.querySelector<HTMLElement>('.lr-list')!;
    setListSize(list, 800, 300);
    resolveFirst(response([record('first')], true));
    await flush();
    expect(mocks.getHistory).toHaveBeenLastCalledWith({ limit: 20, mode: 'all', cursor: 'next' });
    expect(list.querySelectorAll('.lr-receipt')).toHaveLength(2);
  });
  it('列表视口扩大后继续补页，卸载时清理尺寸监听', async () => {
    let resized!: () => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { host, component } = await mount();
    mocks.getHistory.mockResolvedValueOnce(response([record('first')], true));
    component.open();
    await flush();
    const list = host.querySelector<HTMLElement>('.lr-list')!;
    setListSize(list, 400, 1500);
    resized();
    const calls = mocks.getHistory.mock.calls.length;
    setListSize(list, 1600, 1500);
    mocks.getHistory.mockResolvedValueOnce(response([record('second')]));
    resized();
    await flush();
    expect(mocks.getHistory).toHaveBeenCalledTimes(calls + 1);
    expect(list.querySelectorAll('.lr-receipt')).toHaveLength(2);
    cleanup?.();
    cleanup = undefined;
    expect(disconnect).toHaveBeenCalled();
  });
  it.each([null, 'next'])('续页游标缺失或没有前进时保留旧记录并停止自动请求：%s', async (nextCursor) => {
    const { host, component } = await mount();
    mocks.getHistory.mockResolvedValueOnce(response([record('first')], true));
    component.open();
    await flush();
    const list = host.querySelector<HTMLElement>('.lr-list')!;
    setListSize(list, 500, 600);
    mocks.getHistory.mockResolvedValueOnce({ status: 200, data: { rows: [record('bad')], hasMore: true, nextCursor } });
    list.dispatchEvent(new Event('scroll'));
    await flush();
    expect(list.querySelectorAll('.lr-receipt')).toHaveLength(1);
    expect(list.textContent).toContain('抽奖记录加载失败');
    const calls = mocks.getHistory.mock.calls.length;
    list.dispatchEvent(new Event('scroll'));
    await flush();
    expect(mocks.getHistory).toHaveBeenCalledTimes(calls);
  });
  it('切换筛选从列表顶部重新读取，不带入上一筛选的游标和滚动位置', async () => {
    const { host, component } = await mount();
    mocks.getHistory.mockResolvedValueOnce(response([record('first')], true));
    component.open();
    await flush();
    const list = host.querySelector<HTMLElement>('.lr-list')!;
    list.scrollTop = 1400;
    mocks.getHistory.mockResolvedValueOnce(response([record('paid')]));
    host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click();
    await flush();
    expect(mocks.getHistory).toHaveBeenLastCalledWith({ limit: 20, mode: 'paid', cursor: null });
    expect(list.scrollTop).toBe(0);
    expect(list.querySelectorAll('.lr-receipt')).toHaveLength(1);
  });
  it('切号清除旧记录，写前读取的迟到结果不覆盖新账号', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.getHistory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { host } = await mount();
    mocks.getHistory.mockResolvedValue(response([]));
    mocks.user.id = 'two';
    await flush();
    resolveOld(response([record('old-account')]));
    await flush();
    expect(host.textContent).toContain('还没有抽奖记录');
    expect(host.querySelector('.lr-row:not(.lr-columns)')).toBeNull();
  });
});

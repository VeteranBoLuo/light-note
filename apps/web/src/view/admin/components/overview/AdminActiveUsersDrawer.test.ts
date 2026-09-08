import { createApp, defineComponent, h, nextTick, reactive, type App } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import Drawer from './AdminActiveUsersDrawer.vue';
import zh from '@/i18n/locales/zh-CN';
const { getActiveUsers } = vi.hoisted(() => ({ getActiveUsers: vi.fn() }));
vi.mock('@/api/userActivity', () => ({ getActiveUsers }));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: defineComponent({
    props: ['open'],
    setup:
      (p, { slots }) =>
      () =>
        p.open ? h('section', slots.default?.()) : null,
  }),
}));
vi.mock('@/components/base/BasicComponents/BVirtualList.vue', () => ({
  default: defineComponent({
    props: ['items', 'hasMore'],
    emits: ['loadMore'],
    setup:
      (p, { slots, emit }) =>
      () =>
        h('div', [
          p.items.map((item: any) => slots.default?.({ item })),
          p.hasMore && h('button', { onClick: () => emit('loadMore') }, 'next page'),
        ]),
  }),
}));
const date = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const row = (id: string) => ({
  id,
  name: `用户 ${id}`,
  userRemark: '备注',
  firstActiveAt: `${date} 09:00:00.000`,
  lastActiveAt: `${date} 09:30:00.000`,
});
const page = (items: any[] = [row('one')], hasMore = false) => ({
  status: 200,
  data: {
    items,
    hasMore,
    nextCursor: hasMore ? 'cursor' : null,
    total: 2,
    date,
    snapshotAt: `${date} 09:30:00.000`,
    hideInternal: true,
    partialToday: false,
  },
});
let app: App | null = null;
let host: HTMLDivElement;
const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
function mount() {
  host = document.createElement('div');
  document.body.append(host);
  const snapshot = vi.fn();
  const props = reactive({ open: true, hideInternal: true });
  app = createApp({ render: () => h(Drawer, { ...props, onSnapshot: snapshot }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  const vm = app.mount(host) as any;
  return { vm, snapshot, props };
}
afterEach(() => {
  app?.unmount();
  host?.remove();
  getActiveUsers.mockReset();
});
describe('active users drawer', () => {
  it('renders active users and remarks; appends one stable page and only synchronizes first-page count', async () => {
    getActiveUsers.mockResolvedValueOnce(page([row('one')], true)).mockResolvedValueOnce(page([row('two')]));
    const { snapshot } = mount();
    await flush();
    expect(host.textContent).toContain('用户 one');
    expect(snapshot).toHaveBeenCalledTimes(1);
    const more = [...host.querySelectorAll('button')].find((b) => b.textContent === 'next page')!;
    more.click();
    await flush();
    expect(getActiveUsers.mock.calls[1].slice(0, 3)).toEqual([true, 'cursor', `${date} 09:30:00.000`]);
    expect(host.textContent).toContain('用户 two');
    expect(host.textContent).toContain('已加载全部用户');
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
  it('failed initial load offers retry, with no fabricated empty or zero state', async () => {
    getActiveUsers.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([]));
    mount();
    await flush();
    expect(host.textContent).toContain('加载失败');
    expect(host.textContent).not.toContain('今天还没有');
    [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('重试'))!.click();
    await flush();
    expect(host.textContent).toContain('今天还没有');
  });
  it('unmount aborts an in-flight request and ignores its late completion', async () => {
    let resolve!: (value: any) => void;
    getActiveUsers.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { snapshot } = mount();
    await flush();
    const abort = getActiveUsers.mock.calls[0][3] as AbortSignal;
    app?.unmount();
    app = null;
    resolve(page());
    await flush();
    expect(abort.aborted).toBe(true);
    expect(snapshot).not.toHaveBeenCalled();
  });
});

describe('active drawer refresh and scope changes', () => {
  it('scope changes cancel the old request and ignore its late receipt', async () => {
    const finish: Array<(value: any) => void> = [];
    getActiveUsers.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
    const { props, snapshot } = mount();
    await flush();
    const firstSignal = getActiveUsers.mock.calls[0][3] as AbortSignal;
    props.hideInternal = false;
    await flush();
    expect(firstSignal.aborted).toBe(true);
    finish[0](page([row('old')]));
    await flush();
    expect(host.textContent).not.toContain('用户 old');
    expect(snapshot).not.toHaveBeenCalled();
    finish[1]({ ...page([row('new')]), data: { ...page([row('new')]).data, hideInternal: false } });
    await flush();
    expect(host.textContent).toContain('用户 new');
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
  it('manual refresh failure preserves the list and retry replaces rather than appends the snapshot', async () => {
    getActiveUsers
      .mockResolvedValueOnce(page([row('old')]))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([row('new')]));
    mount();
    await flush();
    [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('刷新'))!.click();
    await flush();
    expect(host.textContent).toContain('用户 old');
    expect(host.textContent).toContain('加载失败');
    [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('重试'))!.click();
    await flush();
    expect(host.textContent).toContain('用户 new');
    expect(host.textContent).not.toContain('用户 old');
    expect(getActiveUsers.mock.calls[2].slice(1, 3)).toEqual([null, null]);
  });
});

import { createApp, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import History from './TranslationHistory.vue';
const fetchHistory = vi.hoisted(() => vi.fn());
const removeHistory = vi.hoisted(() => vi.fn());
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: (options: any) => options.onOk() },
}));
vi.mock('@/api/toolbox', () => ({ fetchTranslationHistory: fetchHistory, deleteTranslationHistory: removeHistory }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'owner' }) }));
vi.mock('@/api/noteDetailPrefetch', () => ({ buildNoteDetailRequestScope: () => 'owner' }));
vi.mock('@/composables/useDensityScrollAnchor', () => ({ useDensityScrollAnchor: vi.fn() }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: ref('zh-CN') }) }));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value'],
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
  },
}));
let cleanup = () => {};
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
const row = (id: string) => ({
  id,
  preview: id,
  targetLanguage: 'en',
  status: 'succeeded',
  createdAt: '2026-09-24T08:00:00Z',
});
function mount() {
  const host = document.createElement('div');
  const app = createApp(History, { selected: '', disabled: false, revision: 0 });
  app.mount(host);
  cleanup = () => app.unmount();
  const list = host.querySelector('.history-list') as HTMLElement;
  Object.defineProperties(list, {
    clientHeight: { value: 300 },
    scrollHeight: { value: 900 },
  });
  return { host, list };
}
beforeEach(() => {
  fetchHistory.mockReset();
  removeHistory.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('接近底部自动续页，同一页不重复请求，追加去重且保留滚动位置', async () => {
  let resolve!: (value: unknown) => void;
  fetchHistory.mockResolvedValueOnce({ items: [row('first')], nextCursor: 'cursor' }).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { host, list } = mount();
  await flush();
  expect(fetchHistory).toHaveBeenCalledTimes(1);
  list.scrollTop = 550;
  list.dispatchEvent(new Event('scroll'));
  list.dispatchEvent(new Event('scroll'));
  expect(fetchHistory).toHaveBeenCalledTimes(2);
  expect(fetchHistory).toHaveBeenLastCalledWith('cursor', '');
  resolve({ items: [row('first'), row('second')], nextCursor: null });
  await flush();
  expect(host.querySelectorAll('.history-row')).toHaveLength(2);
  expect(list.scrollTop).toBe(550);
  list.dispatchEvent(new Event('scroll'));
  expect(fetchHistory).toHaveBeenCalledTimes(2);
});
it('续页失败保留列表，滚动不自动重试，重试复用失败游标', async () => {
  fetchHistory
    .mockResolvedValueOnce({ items: [row('first')], nextCursor: 'cursor' })
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ items: [row('second')], nextCursor: null });
  const { host, list } = mount();
  await flush();
  list.scrollTop = 600;
  list.dispatchEvent(new Event('scroll'));
  await flush();
  expect(host.querySelectorAll('.history-row')).toHaveLength(1);
  list.dispatchEvent(new Event('scroll'));
  expect(fetchHistory).toHaveBeenCalledTimes(2);
  (host.querySelector('[role="alert"] button') as HTMLButtonElement).click();
  await flush();
  expect(fetchHistory).toHaveBeenLastCalledWith('cursor', '');
  expect(host.querySelectorAll('.history-row')).toHaveLength(2);
});
it('搜索切换后丢弃旧续页响应，使用关键词从服务端第一页查询', async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  fetchHistory
    .mockResolvedValueOnce({ items: [row('first')], nextCursor: 'cursor' })
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValueOnce({ items: [row('match')], nextCursor: null });
  const { host, list } = mount();
  await flush();
  list.scrollTop = 600;
  list.dispatchEvent(new Event('scroll'));
  const input = host.querySelector('input')!;
  input.value = 'match';
  input.dispatchEvent(new Event('input'));
  await flush();
  resolve({ items: [row('stale')], nextCursor: null });
  await vi.advanceTimersByTimeAsync(250);
  await flush();
  expect(fetchHistory).toHaveBeenLastCalledWith('', 'match');
  expect(host.querySelectorAll('.history-row')).toHaveLength(1);
  expect(host.querySelector('.history-row')?.textContent).toContain('match');
  expect(list.scrollTop).toBe(0);
});

it('管理中可勾选多条删除，删除后只移除返回的记录', async () => {
  fetchHistory.mockResolvedValue({ items: [row('a'), row('b'), row('c')], nextCursor: null });
  removeHistory.mockResolvedValue({ deletedIds: ['a', 'b'] });
  const { host } = mount();
  await flush();
  (host.querySelector('.history-manage') as HTMLButtonElement).click();
  await flush();
  (host.querySelectorAll('.history-row')[0] as HTMLButtonElement).click();
  (host.querySelectorAll('.history-row')[1] as HTMLButtonElement).click();
  await flush();
  (host.querySelector('.danger_btn') as HTMLButtonElement).click();
  await flush();
  expect(removeHistory).toHaveBeenCalledWith(['a', 'b']);
  expect(host.querySelectorAll('.history-row')).toHaveLength(1);
  expect(host.querySelector('.history-row')?.textContent).toContain('c');
});

it('单条删除失败时保留记录和选择，可再次重试', async () => {
  fetchHistory.mockResolvedValue({ items: [row('a')], nextCursor: null });
  removeHistory.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ deletedIds: ['a'] });
  const { host } = mount();
  await flush();
  (host.querySelector('.history-manage') as HTMLButtonElement).click();
  await flush();
  (host.querySelector('.history-row') as HTMLButtonElement).click();
  await flush();
  (host.querySelector('.danger_btn') as HTMLButtonElement).click();
  await flush();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('translation.deleteHistoryFailed');
  expect(host.querySelectorAll('.history-row')).toHaveLength(1);
  (host.querySelector('.danger_btn') as HTMLButtonElement).click();
  await flush();
  expect(removeHistory).toHaveBeenLastCalledWith(['a']);
  expect(host.querySelectorAll('.history-row')).toHaveLength(0);
});

it('清空全部使用服务端全量范围，不把当前已加载记录当作全部', async () => {
  fetchHistory.mockResolvedValue({items:[row('a')],nextCursor:'more'});
  removeHistory.mockResolvedValue({deletedIds:[],cleared:true,count:75});
  const {host} = mount();
  await flush();
  (host.querySelector('.history-manage') as HTMLButtonElement).click();
  await flush();
  (host.querySelector('.history-clear') as HTMLButtonElement).click();
  await flush();
  expect(removeHistory).toHaveBeenCalledWith([],true);
  expect(host.querySelectorAll('.history-row')).toHaveLength(0);
});

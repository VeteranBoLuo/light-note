import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/http/request.ts', () => ({ apiBaseGet: mocks.get, apiBasePost: mocks.post }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { props: ['visible'], template: '<section v-if="visible"><slot/></section>' },
}));
vi.mock('@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue', () => ({ default: { template: '<div />' } }));
const { default: Modal } = await import('./LinkHealthModal.vue');
let cleanup = () => {};
const response = { status: 200, data: { total: 10, checked: 1, running: true, suspect: [] } };
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); await nextTick(); }
function mount() {
  const visible = ref(false), host = document.createElement('div');
  const app = createApp({ setup: () => () => h(Modal, { visible: visible.value }) });
  app.use(createI18n({ legacy: false, locale: 'zh', messages: { zh: {} }, missingWarn: false, fallbackWarn: false }));
  app.directive('click-log', {}); app.directive('auto-scrollbar', {});
  document.body.append(host); app.mount(host);
  cleanup = () => { app.unmount(); host.remove(); };
  return visible;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  mocks.get.mockResolvedValue(response);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('coalesces slow polls and pauses requests while the page is hidden', async () => {
  const visible = mount(); visible.value = true; await settle();
  let finish!: (value: unknown) => void;
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(10_000);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  finish(response); await settle();
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(mocks.get).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  await vi.advanceTimersByTimeAsync(2500);
  expect(mocks.get).toHaveBeenCalledTimes(3);
});

it('closing before the initial response cannot restart a hidden modal poller', async () => {
  let finish!: (value: unknown) => void;
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const visible = mount(); visible.value = true; await settle();
  visible.value = false; await settle(); finish(response); await settle();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

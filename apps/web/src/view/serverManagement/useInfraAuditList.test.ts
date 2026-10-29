import { createApp, h, computed, ref, nextTick } from 'vue';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
const load = vi.fn();
vi.mock('@/api/commonApi', () => ({ getAdminOperationAudits: load }));
const { useInfraAuditList } = await import('./useInfraAuditList');
const cleanups: Array<() => void> = [];
const response = (id: string) => ({ status: 200, data: { items: [{ id }], total: 1, filteredSummary: { total: 1 } } });
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const page = ref(1);
  const keyword = ref('');
  let runtime!: ReturnType<typeof useInfraAuditList>;
  const app = createApp({
    setup() {
      runtime = useInfraAuditList(
        computed(() => ({
          currentPage: page.value,
          pageSize: 20,
          keyword: keyword.value,
          outcome: 'all',
          startDate: '',
          endDate: '',
        })),
      );
      return () => h('div');
    },
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { runtime, page, keyword };
}
beforeEach(() => {
  load.mockReset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
describe('infra audit query', () => {
  it('binds every request to infra scope and the current server-side page', async () => {
    load.mockResolvedValue(response('one'));
    const { runtime, page } = mount();
    await vi.waitFor(() => expect(runtime.data.value?.total).toBe(1));
    page.value = 2;
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[1][0]).toMatchObject({
      actionScope: 'infra',
      currentPage: 2,
      pageSize: 20,
      includeSummary7d: false,
    });
  });
  it('ignores an old response after the target filter changes', async () => {
    let resolveOld!: (value: unknown) => void;
    load.mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve))).mockResolvedValueOnce(response('new'));
    const { runtime, keyword } = mount();
    keyword.value = 'new';
    await vi.waitFor(() => expect(runtime.data.value?.items[0].id).toBe('new'));
    resolveOld(response('old'));
    await nextTick();
    expect(runtime.data.value?.items[0].id).toBe('new');
  });
  it('preserves a successful snapshot only on refresh failure within the same scope', async () => {
    load
      .mockResolvedValueOnce(response('one'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('new scope unavailable'));
    const { runtime, keyword } = mount();
    await vi.waitFor(() => expect(runtime.data.value).not.toBeNull());
    await runtime.refresh();
    expect(runtime.data.value?.items[0].id).toBe('one');
    expect(runtime.error.value).toBe('temporary');
    keyword.value = 'different';
    await vi.waitFor(() => expect(runtime.error.value).toBe('new scope unavailable'));
    expect(runtime.data.value).toBeNull();
  });
});

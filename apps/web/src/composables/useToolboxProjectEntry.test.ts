import { createApp, h, reactive, nextTick, type App } from 'vue';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: null as any, get: vi.fn(), post: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/http/request', () => ({ apiBaseGet: mocks.get, apiBasePost: mocks.post }));
import { useToolboxProjectEntry } from './useToolboxProjectEntry';
import { invalidateToolboxProjects } from '@/utils/toolboxProjectState';
const states: ReturnType<typeof useToolboxProjectEntry>[] = [];
let app: App,
  host: HTMLElement,
  sequence = 0;
async function settle() {
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}
beforeEach(() => {
  vi.clearAllMocks();
  states.length = 0;
  mocks.user = reactive({
    id: `owner-${++sequence}`,
    role: 'user',
    preferences: {},
    adminContext: null,
    visitorWorkspace: null,
  });
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  app?.unmount();
  host.remove();
});
function mount(count = 1) {
  const Child = {
    setup() {
      states.push(useToolboxProjectEntry());
      return () => h('div');
    },
  };
  app = createApp({
    render: () =>
      h(
        'div',
        Array.from({ length: count }, (_, i) => h(Child, { key: i })),
      ),
  });
  app.mount(host);
}
it('coalesces requests across consumers and refreshes only after invalidation or expiry', async () => {
  mocks.get.mockResolvedValue({ status: 200, data: { hasProjects: false, dismissed: false, projects: [] } });
  mount(2);
  await settle();
  expect(mocks.get).toHaveBeenCalledTimes(1);
  await states[0].load();
  expect(mocks.get).toHaveBeenCalledTimes(1);
  invalidateToolboxProjects();
  await settle();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
it('does not treat a failed load as an empty account and allows visitor reads but excludes managed contexts', async () => {
  mocks.get.mockRejectedValue(new Error('network'));
  mount();
  await settle();
  expect(states[0].failed.value).toBe(true);
  expect(states[0].data.value).toBeNull();
  mocks.get.mockClear();
  mocks.user.adminContext = { userId: 'managed' };
  await settle();
  expect(states[0].eligible.value).toBe(false);
  expect(mocks.get).not.toHaveBeenCalled();
  mocks.user.adminContext = null;
  mocks.user.role = 'visitor';
  mocks.get.mockResolvedValue({ status: 200, data: { hasProjects: true, projects: [{ id: 'example' }] } });
  await settle();
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(states[0].data.value?.projects[0].id).toBe('example');
  await states[0].dismiss();
  expect(mocks.post).not.toHaveBeenCalled();
});
it('discards a previous account response and honors a saved dismissal without hiding projects', async () => {
  let resolve!: (value: any) => void;
  mocks.get
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue({
      status: 200,
      data: { hasProjects: true, dismissed: true, projects: [{ id: 'new-project' }] },
    });
  mount();
  mocks.user.id = 'new-owner-' + sequence;
  await settle();
  resolve({ status: 200, data: { hasProjects: false, dismissed: false, projects: [] } });
  await settle();
  expect(states[0].data.value?.projects[0].id).toBe('new-project');
  expect(states[0].data.value?.dismissed).toBe(true);
});

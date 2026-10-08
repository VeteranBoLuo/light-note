import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive, ref, watch } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
const load = vi.fn(),
  error = vi.fn(),
  mounted = vi.fn(),
  saved = vi.fn(),
  opened = vi.fn();
const user = reactive({ id: 'owner', role: 'user' });
const currentRoute = ref({ fullPath: '/workbenches' });
vi.mock('./todayTodoEditorLoader', () => ({ loadTodayTodoEditor: load }));
vi.mock('@/store', () => ({ inboxStore: () => ({}), useUserStore: () => user }));
vi.mock('vue-router', () => ({ useRouter: () => ({ currentRoute, push: vi.fn() }) }));
vi.mock('@/utils/common', () => ({ generateUUID: () => 'test-id' }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { error } }));
vi.mock('@/components/base/AsyncFeatureLoadingOverlay.vue', () => ({ default: { template: '<div data-loading />' } }));
const { default: Section } = await import('./TodayActionSection.vue');
const Editor = defineComponent({
  props: ['visible', 'item'],
  emits: ['update:visible', 'saved'],
  setup(props, { emit }) {
    mounted();
    watch(
      () => props.visible,
      (value) => {
        if (value) opened();
      },
    );
    return () =>
      h('div', { 'data-editor': props.item?.id, 'data-visible': String(props.visible) }, [
        h('button', { 'data-close': '', onClick: () => emit('update:visible', false) }, 'close'),
        h('button', { 'data-save': '', onClick: () => emit('saved') }, 'save'),
      ]);
  },
});
let host: HTMLDivElement, app: ReturnType<typeof createApp> | undefined;
beforeEach(async () => {
  user.id = 'owner';
  currentRoute.value = { fullPath: '/workbenches' };
  load.mockReset();
  mounted.mockClear();
  saved.mockClear();
  error.mockClear();
  opened.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(Section, {
        overdueTodos: ['first', 'second'].map((id) => ({
          id,
          title: id,
          status: 'pending',
          dueAt: '2026-01-01',
          checklist: [],
        })),
        dueTodayTodos: [],
        inboxItems: [],
        onRefresh: saved,
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  await nextTick();
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
});
const edit = (index = 0) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')]
    .filter((b) => b.textContent?.includes('编辑待办'))
    [index].click();
it('loads on first click, keeps the mounted editor after close, and retains save refresh', async () => {
  expect(load).not.toHaveBeenCalled();
  load.mockResolvedValue(Editor);
  edit();
  await vi.waitFor(() => expect(host.querySelector('[data-editor]')?.getAttribute('data-editor')).toBe('first'));
  expect(opened).toHaveBeenCalledOnce();
  host.querySelector<HTMLButtonElement>('[data-save]')!.click();
  expect(saved).toHaveBeenCalledOnce();
  host.querySelector<HTMLButtonElement>('[data-close]')!.click();
  await nextTick();
  edit(1);
  await nextTick();
  expect(host.querySelector('[data-editor]')?.getAttribute('data-editor')).toBe('second');
  expect(mounted).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledOnce();
});
it('keeps the newest target and allows a failed download to be retried', async () => {
  load.mockRejectedValueOnce(Error('offline'));
  edit();
  await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
  let resolve!: (value: typeof Editor) => void;
  const pending = new Promise<typeof Editor>((r) => {
    resolve = r;
  });
  load.mockReturnValue(pending);
  edit();
  edit(1);
  await nextTick();
  expect(host.querySelector('[data-loading]')).not.toBeNull();
  resolve(Editor);
  await vi.waitFor(() => expect(host.querySelector('[data-editor]')?.getAttribute('data-editor')).toBe('second'));
});
it.each(['identity', 'route', 'unmount'])('ignores a late download after %s changes', async (change) => {
  let resolve!: (value: typeof Editor) => void;
  load.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  edit();
  if (change === 'identity') user.id = 'other';
  else if (change === 'route') currentRoute.value = { fullPath: '/home' };
  else {
    app!.unmount();
    app = undefined;
  }
  resolve(Editor);
  await nextTick();
  await Promise.resolve();
  await nextTick();
  expect(host.querySelector('[data-editor]')).toBeNull();
  expect(mounted).not.toHaveBeenCalled();
});

it('preserves the open draft when overlay history replaces the route at the same URL', async () => {
  load.mockResolvedValue(Editor);
  edit();
  await vi.waitFor(() => expect(host.querySelector('[data-visible="true"]')).not.toBeNull());
  currentRoute.value = { fullPath: '/workbenches' };
  await nextTick();
  expect(host.querySelector('[data-visible="true"]')?.getAttribute('data-editor')).toBe('first');
  expect(mounted).toHaveBeenCalledOnce();
});

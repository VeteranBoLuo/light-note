import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  closeCurrentMobileOverlayThen: vi.fn(),
  releaseOverlay: null as (() => void) | null,
  routerPush: vi.fn(),
  layout: { isMobile: true, isTablet: false, isDesktop: false },
  inbox: {
    quickCaptureType: 'todo',
    pendingTotal: 0,
    refreshCount: vi.fn(),
    refreshList: vi.fn(),
  },
  todo: { refreshCount: vi.fn(), refreshList: vi.fn() },
  detailsPayload: {
    title: '整理移动端待办交接',
    description: '保留快速添加中已经填写的内容',
    priority: 2,
    dueAt: '2026-08-26T23:59',
    checklist: [{ id: 'check-1', text: '核对详情页初始值', done: false }],
    quickReminderPreset: 'daily',
    quickReminderTime: '09:30',
  },
}));

vi.mock('@/store', () => ({
  bookmarkStore: () => mocks.layout,
  inboxStore: () => mocks.inbox,
  todoStore: () => mocks.todo,
}));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({
    push: mocks.routerPush,
    currentRoute: { value: { path: '/workbenches' } },
  }),
}));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/todoApi', () => ({
  createTodoPlanV2: vi.fn(),
  previewTodoPlanV2: vi.fn(),
  getTodoPlanV2Config: vi.fn().mockResolvedValue({ status: 200, data: { quickReminderPresetsEnabled: true } }),
}));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/composables/useBookmarkUrlResolution', () => ({ preflightBookmarkUrl: vi.fn() }));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: mocks.closeCurrentMobileOverlayThen,
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), loading: vi.fn(() => vi.fn()) },
}));

vi.mock('@/components/base/BasicComponents/BDrawer.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'BDrawerStub',
      props: {
        open: Boolean,
        maskClosable: Boolean,
      },
      emits: ['close'],
      setup(props, { slots }) {
        return () =>
          props.open
            ? h(
                'section',
                {
                  class: 'drawer-stub',
                  'data-mask-closable': String(props.maskClosable),
                },
                slots.default?.(),
              )
            : null;
      },
    }),
  };
});
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { name: 'BModalStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: { name: 'BTabsStub', template: '<div />' },
}));
vi.mock('@/components/mobile/MobileNoticeStrip.vue', () => ({
  default: { name: 'MobileNoticeStripStub', template: '<div />' },
}));
vi.mock('@/components/todo/QuickTodoForm.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'QuickTodoFormStub',
      emits: ['details'],
      setup(_, { emit }) {
        return () =>
          h(
            'button',
            {
              class: 'todo-details-stub',
              onClick: () => emit('details', mocks.detailsPayload),
            },
            '完善详情',
          );
      },
    }),
  };
});
vi.mock('@/components/todo/TodoEditorModal.vue', () => ({
  default: { name: 'TodoEditorModalStub', template: '<div />' },
}));

const { default: QuickCaptureModal } = await import('./QuickCaptureModal.vue');

let cleanup: (() => void) | undefined;

function mountQuickCapture() {
  const host = document.createElement('div');
  document.body.append(host);
  const visible = ref(true);
  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(QuickCaptureModal, {
            visible: visible.value,
            'onUpdate:visible': (value: boolean) => (visible.value = value),
          });
      },
    }),
  );
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, visible };
}

beforeEach(() => {
  mocks.releaseOverlay = null;
  vi.clearAllMocks();
  mocks.closeCurrentMobileOverlayThen.mockImplementation(async (close: () => void, next: () => unknown) => {
    close();
    await new Promise<void>((resolve) => {
      mocks.releaseOverlay = resolve;
    });
    return await next();
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('快速添加 · 移动端完善详情', () => {
  it('关闭抽屉并触发表单重置后，仍把关闭前的完整草稿交给待办新建页', async () => {
    const { host, visible } = mountQuickCapture();

    host.querySelector<HTMLButtonElement>('.todo-details-stub')!.click();
    await nextTick();
    await nextTick();

    expect(visible.value).toBe(false);
    expect(mocks.routerPush).not.toHaveBeenCalled();
    expect(mocks.releaseOverlay).not.toBeNull();

    mocks.releaseOverlay?.();
    await Promise.resolve();
    await nextTick();

    expect(mocks.routerPush).toHaveBeenCalledWith({
      name: 'todoCreate',
      state: { todoInitialValues: mocks.detailsPayload },
    });
  });

  it('移动端快速添加始终禁用点击蒙层关闭', () => {
    const { host } = mountQuickCapture();

    expect(host.querySelector('.drawer-stub')?.getAttribute('data-mask-closable')).toBe('false');
  });
});

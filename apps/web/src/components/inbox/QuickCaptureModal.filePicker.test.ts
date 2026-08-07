import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 快速添加 —— 点「选择文件」这条路径。
 *
 * 曾经坏过一次:重构把 `selectFiles` 改名成 `addFiles(value, source)`,拖拽和粘贴两个
 * 调用点都跟着改了,模板里的 `@change="selectFiles"` 漏了。模板引用一个不存在的标识符
 * 既不报错也不警告(tsc 不看 .vue 模板、vite build 也不校验模板标识符),于是 BUpload 的
 * change 事件落地即消失:文件列表永远是空的、「加入待整理」永远置灰,而手机上既不能拖拽
 * 也没法粘贴文件,这条路是唯一入口 —— 等于功能完全不可用。
 *
 * 所以这里断言的是「BUpload 抛出 change 之后,文件真的进了列表且提交按钮可用」,
 * 而不是去测 addFiles 本身 —— 后者当时是好的,坏的是模板到函数之间那一环。
 */

const layout = { isMobile: false, isTablet: false, isDesktop: true };
const inbox = {
  quickCaptureType: 'file',
  pendingTotal: 0,
  refreshCount: vi.fn(),
  refreshList: vi.fn(),
};
const todo = { refreshCount: vi.fn(), refreshList: vi.fn() };

/** BUpload stub 每次 change 抛出的文件,由用例赋值 */
let stubFiles: File[] = [];

vi.mock('@/store', () => ({
  bookmarkStore: () => layout,
  inboxStore: () => inbox,
  todoStore: () => todo,
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn().mockResolvedValue({ status: 200, data: {} }) }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/todoApi', () => ({ createTodo: vi.fn() }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/composables/useBookmarkUrlResolution', () => ({ preflightBookmarkUrl: vi.fn() }));
vi.mock('@/utils/mobileOverlayHistory', () => ({ closeCurrentMobileOverlayThen: (fn: () => void) => fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), loading: vi.fn(() => vi.fn()) },
}));

// 外壳透传,否则弹框内容不进 DOM,拿不到文件列表和按钮
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { name: 'BModalStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: { name: 'BDrawerStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: { name: 'BTabsStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: { name: 'BInputStub', template: '<input />' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
vi.mock('@/components/todo/QuickTodoForm.vue', () => ({
  default: { name: 'QuickTodoFormStub', template: '<div />' },
}));
vi.mock('@/components/todo/TodoEditorModal.vue', () => ({
  default: { name: 'TodoEditorModalStub', template: '<div />' },
}));
// 按钮要能反映 disabled,断言才有意义
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    name: 'BButtonStub',
    props: ['disabled', 'loading', 'type', 'size'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
}));
// 用点击代替真实文件选择:点一下就 emit 一次 change,模拟 BUpload 选完文件后的行为
vi.mock('@/components/base/BasicComponents/BUpload.vue', () => ({
  default: {
    name: 'BUploadStub',
    props: ['multiple', 'rawFile', 'maxTotalSize'],
    emits: ['change'],
    setup(_: unknown, { emit }: { emit: (event: 'change', files: File[]) => void }) {
      return () => h('button', { class: 'upload-stub', onClick: () => emit('change', stubFiles) }, 'pick');
    },
  },
}));

const { default: QuickCaptureModal } = await import('./QuickCaptureModal.vue');

let cleanup: (() => void) | undefined;

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(QuickCaptureModal, { visible: true }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  // 模板用了 v-click-log,不注册会在挂载时报未知指令
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

/** 「加入待整理」是最后一个按钮(取消在它前面) */
function collectButton(host: HTMLElement) {
  const buttons = Array.from(host.querySelectorAll('button')).filter(
    (b) => b.textContent?.trim() === zhCN.inbox.collect,
  );
  return buttons[0] as HTMLButtonElement | undefined;
}

beforeEach(() => {
  stubFiles = [];
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('快速添加 · 选择文件', () => {
  it('BUpload 抛出 change 后文件进入列表，「加入待整理」变为可用', async () => {
    stubFiles = [new File(['# 周报'], '周报.md', { type: 'text/markdown' })];
    const host = mount();

    // 选之前:没有文件项,提交置灰
    expect(host.querySelectorAll('.file-list__item')).toHaveLength(0);
    expect(collectButton(host)?.disabled).toBe(true);

    host.querySelector<HTMLButtonElement>('.upload-stub')!.click();
    await nextTick();

    // 选之后:文件进列表,提交可用 —— 模板 handler 一旦再次失联,这两条同时失败
    expect(host.querySelectorAll('.file-list__item')).toHaveLength(1);
    expect(host.textContent).toContain('周报.md');
    expect(collectButton(host)?.disabled).toBe(false);
  });

  it('多选文件全部进入列表', async () => {
    stubFiles = [
      new File(['a'], 'a.md', { type: 'text/markdown' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ];
    const host = mount();

    host.querySelector<HTMLButtonElement>('.upload-stub')!.click();
    await nextTick();

    expect(host.querySelectorAll('.file-list__item')).toHaveLength(2);
  });

  it('同一文件重复选择不会产生重复项', async () => {
    stubFiles = [new File(['a'], 'a.md', { type: 'text/markdown' })];
    const host = mount();

    const picker = host.querySelector<HTMLButtonElement>('.upload-stub')!;
    picker.click();
    await nextTick();
    picker.click();
    await nextTick();

    expect(host.querySelectorAll('.file-list__item')).toHaveLength(1);
  });
});

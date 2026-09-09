import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const layout = { isMobile: false, isTablet: false, isDesktop: true };
const inbox = {
  quickCaptureType: 'note',
  quickCaptureTypeExplicit: true,
  pendingTotal: 0,
  refreshCount: vi.fn(),
  refreshList: vi.fn(),
};
const todo = { refreshCount: vi.fn(), refreshList: vi.fn() };

vi.mock('@/store', () => ({
  bookmarkStore: () => layout,
  inboxStore: () => inbox,
  todoStore: () => todo,
}));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn().mockResolvedValue({ status: 200, data: {} }) }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/todoApi', () => ({
  createTodoPlanV2: vi.fn(),
  previewTodoPlanV2: vi.fn(),
  getTodoPlanV2Config: vi.fn().mockResolvedValue({ status: 200, data: { quickReminderPresetsEnabled: true } }),
}));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/composables/useBookmarkUrlResolution', () => ({ preflightBookmarkUrl: vi.fn() }));
vi.mock('@/utils/mobileOverlayHistory', () => ({ closeCurrentMobileOverlayThen: (fn: () => void) => fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), loading: vi.fn(() => vi.fn()) },
}));

// 外壳透传，输入与页签保留真实组件来验证事件链。
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { name: 'BModalStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: { name: 'BDrawerStub', template: '<div><slot /></div>' },
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
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    name: 'BButtonStub',
    props: ['disabled', 'loading', 'type', 'size'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
}));
vi.mock('@/components/base/BasicComponents/BUpload.vue', () => ({
  default: { name: 'BUploadStub', template: '<div />' },
}));

const { default: QuickCaptureModal } = await import('./QuickCaptureModal.vue');

let cleanup: (() => void) | undefined;

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const visible = ref(true);
  const app = createApp({
    render: () => h(QuickCaptureModal, { visible: visible.value }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  // 模板用了 v-click-log,不注册会在挂载时报未知指令
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, visible };
}

async function pasteText(host: HTMLElement, text: string) {
  const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: { files: [], getData: () => text } });
  input.dispatchEvent(paste);
  // jsdom 不执行原生粘贴的默认输入动作。
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

function selectedTab(host: HTMLElement) {
  return host.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  inbox.quickCaptureType = 'note';
  inbox.quickCaptureTypeExplicit = true;
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe.each([false, true])('快速添加类型选择 · mobile=%s', (isMobile) => {
  beforeEach(() => {
    layout.isMobile = isMobile;
    layout.isDesktop = !isMobile;
  });

  it('明确从笔记入口打开时，首次挂载粘贴网址仍保留笔记和原文', async () => {
    const { host } = mount();
    await pasteText(host, 'https://example.com/reference');
    expect(selectedTab(host)).toBe(zhCN.inbox.note);
    expect(host.querySelector('textarea')?.value).toBe('https://example.com/reference');
  });

  it('通用入口随文本识别笔记和书签，手动选中后固定类型', async () => {
    inbox.quickCaptureType = 'bookmark';
    inbox.quickCaptureTypeExplicit = false;
    const { host } = mount();
    await pasteText(host, '一段笔记');
    expect(selectedTab(host)).toBe(zhCN.inbox.note);
    await pasteText(host, 'https://example.com');
    expect(selectedTab(host)).toBe(zhCN.inbox.bookmark);
    const noteTab = Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]')).find(
      (tab) => tab.textContent?.trim() === zhCN.inbox.note,
    )!;
    noteTab.click();
    await nextTick();
    await pasteText(host, 'https://example.com/another');
    expect(selectedTab(host)).toBe(zhCN.inbox.note);
  });

  it('点击当前自动识别的笔记页签也算明确选择', async () => {
    inbox.quickCaptureTypeExplicit = false;
    const { host } = mount();
    host.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!.click();
    await nextTick();
    await pasteText(host, 'https://example.com');
    expect(selectedTab(host)).toBe(zhCN.inbox.note);
  });

  it('关闭重开按新入口恢复识别策略，不残留上次手动类型', async () => {
    const { host, visible } = mount();
    await pasteText(host, 'https://example.com');
    visible.value = false;
    await nextTick();
    inbox.quickCaptureType = 'bookmark';
    inbox.quickCaptureTypeExplicit = false;
    visible.value = true;
    await nextTick();
    await pasteText(host, '重新记录');
    expect(selectedTab(host)).toBe(zhCN.inbox.note);
    await pasteText(host, 'https://example.com/new');
    expect(selectedTab(host)).toBe(zhCN.inbox.bookmark);
    visible.value = false;
    await nextTick();
    inbox.quickCaptureType = 'note';
    inbox.quickCaptureTypeExplicit = true;
    visible.value = true;
    await nextTick();
    await pasteText(host, 'https://example.com/fixed');
    expect(selectedTab(host)).toBe(zhCN.inbox.note);
  });
});

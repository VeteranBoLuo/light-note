import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import { apiBasePost } from '@/http/request';
import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
const account = reactive({ id: 'capture-test-user', adminContext: null });

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
  useUserStore: () => account,
  bookmarkStore: () => layout,
  inboxStore: () => inbox,
  todoStore: () => todo,
}));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: vi.fn(), currentRoute: { value: { path: '/workbenches', query: {} } } }),
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
  const captured = vi.fn();
  const app = createApp({
    render: () => h(QuickCaptureModal, { visible: visible.value, onCaptured: captured }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  // 模板用了 v-click-log,不注册会在挂载时报未知指令
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, visible, captured };
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
  account.id = 'capture-test-user';
  vi.mocked(apiBasePost).mockReset();
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


async function clickSave(host: HTMLElement) {
  const button = host.querySelector<HTMLButtonElement>('.capture-actions button:last-child')!;
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

function noteRequests() {
  return vi.mocked(apiBasePost).mock.calls.filter(([url]) => url === '/api/note/addNote').map(([, body]) => body as any);
}

describe('快速添加笔记重试', () => {
  it('响应丢失后的相同输入重试复用一次保存，继续添加相同正文是新操作', async () => {
    const saved = new Map<string, string>();
    let loseResponse = true;
    vi.mocked(apiBasePost).mockImplementation(async (_url, body: any) => {
      const key = body.idempotencyKey || `unkeyed-${saved.size}`;
      if (!saved.has(key)) saved.set(key, `note-${saved.size}`);
      if (loseResponse) { loseResponse = false; throw new Error('response lost'); }
      return { status: 200, data: { id: saved.get(key) } } as any;
    });
    const { host } = mount();
    await pasteText(host, '同一份资料');
    await clickSave(host);
    expect(host.querySelector('textarea')?.value).toBe('同一份资料');
    await clickSave(host);
    expect(saved.size).toBe(1);
    expect(noteRequests()[0].idempotencyKey).toBeTruthy();
    expect(noteRequests()[1].idempotencyKey).toBe(noteRequests()[0].idempotencyKey);
    host.querySelector<HTMLButtonElement>('.capture-success__actions button:last-child')!.click();
    await nextTick();
    await pasteText(host, '同一份资料');
    await clickSave(host);
    expect(saved.size).toBe(2);
  });

  it('失败后修改正文、关闭重开都使用新操作标识', async () => {
    vi.mocked(apiBasePost).mockRejectedValue(new Error('offline'));
    const { host, visible } = mount();
    await pasteText(host, '旧正文'); await clickSave(host);
    await pasteText(host, '新正文'); await clickSave(host);
    visible.value = false; await nextTick();
    visible.value = true; await nextTick();
    await pasteText(host, '新正文'); await clickSave(host);
    const keys = noteRequests().map((body) => body.idempotencyKey);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(3);
  });

  it('切号清除草稿与收据，旧账号迟到响应不展示成功', async () => {
    let finish!: (value: any) => void;
    vi.mocked(apiBasePost).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { host, visible } = mount();
    await pasteText(host, '旧账号资料'); await clickSave(host);
    account.id = 'another-user'; await nextTick();
    finish({ status: 200, data: { id: 'old-account-note' } });
    await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick();
    expect(host.querySelector('.capture-success')).toBeNull();
    expect(host.querySelector('textarea')?.value).toBe('');
    visible.value = false; await nextTick(); visible.value = true; await nextTick();
    vi.mocked(apiBasePost).mockResolvedValue({ status: 200, data: { id: 'new-account-note' } } as any);
    await pasteText(host, '旧账号资料'); await clickSave(host);
    expect(noteRequests()[1].idempotencyKey).not.toBe(noteRequests()[0].idempotencyKey);
  });
});

describe('快速保存异步阶段结束后的会话检查', () => {
  it.each(['switch', 'close', 'unmount'])('网址预检期间 %s 后，不继续提交旧链接', async (action) => {
    inbox.quickCaptureType = 'bookmark';
    let finish!: (value: any) => void;
    vi.mocked(preflightBookmarkUrl).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    vi.mocked(apiBasePost).mockResolvedValue({ status: 200, data: { id: 'bookmark-old' } } as any);
    const { host, visible, captured } = mount();
    await pasteText(host, 'https://example.com/old');
    await clickSave(host);
    const signal = vi.mocked(preflightBookmarkUrl).mock.calls.at(-1)?.[1]?.signal;
    if (action === 'switch') account.id = 'new-owner';
    else if (action === 'unmount') { cleanup?.(); cleanup = undefined; }
    else visible.value = false;
    await nextTick();
    expect(signal?.aborted).toBe(true);
    finish({ ok: true, url: 'https://example.com/old' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiBasePost).not.toHaveBeenCalled();
    expect(captured).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
  });

  it('链接保存响应迟到时不回填已经关闭的面板', async () => {
    inbox.quickCaptureType = 'bookmark';
    vi.mocked(preflightBookmarkUrl).mockResolvedValueOnce({ ok: true, url: 'https://example.com/old' } as any);
    let finish!: (value: any) => void;
    vi.mocked(apiBasePost).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { host, visible, captured } = mount();
    await pasteText(host, 'https://example.com/old');
    await clickSave(host);
    visible.value = false;
    await nextTick();
    finish({ status: 200, data: { id: 'bookmark-old' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captured).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
    expect(inbox.refreshCount).not.toHaveBeenCalled();
  });

  it('保存成功后的列表刷新迟到时，不向新会话发送完成通知', async () => {
    let finish!: () => void;
    inbox.refreshCount.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    vi.mocked(apiBasePost).mockResolvedValue({ status: 200, data: { id: 'note-old' } } as any);
    const { host, captured } = mount();
    await pasteText(host, '已保存的旧账号笔记');
    await clickSave(host);
    account.id = 'new-owner';
    await nextTick();
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captured).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
  });
});

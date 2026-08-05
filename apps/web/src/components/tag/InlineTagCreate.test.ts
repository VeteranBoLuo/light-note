import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import zhCN from '@/i18n/locales/zh-CN';

const apiBasePost = vi.fn();
const blockGuestWrite = vi.fn(() => false);
const warning = vi.fn();
const error = vi.fn();

vi.mock('@/http/request', () => ({ apiBasePost }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning, error, success: vi.fn(), info: vi.fn() },
}));

const isMobile = { value: false };
vi.mock('@/store', () => ({
  bookmarkStore: () => ({
    get isMobile() {
      return isMobile.value;
    },
  }),
}));

const { default: InlineTagCreate } = await import('./InlineTagCreate.vue');

let cleanup: (() => void) | undefined;

function mount(existingTags: { id: string; name: string }[] = []) {
  const events: Record<string, any[]> = { created: [], reused: [], stale: [] };
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(InlineTagCreate, {
          existingTags,
          onCreated: (tag: any) => events.created.push(tag),
          onReused: (tag: any) => events.reused.push(tag),
          onStale: () => events.stale.push(true),
        });
    },
  });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, events };
}

/** 展开输入行并填入名字 */
async function typeName(host: HTMLElement, value: string) {
  host.querySelector<HTMLElement>('.inline-tag-create__entry')!.click();
  await nextTick();
  const input = host.querySelector<HTMLInputElement>('input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await nextTick();
  return input;
}

function confirmButton(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>('.inline-tag-create__submit')!;
}

function cancelButton(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>('.inline-tag-create__cancel')!;
}

describe('InlineTagCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blockGuestWrite.mockReturnValue(false);
    isMobile.value = false;
    apiBasePost.mockResolvedValue({ status: 200, data: { id: 'tag-new' } });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('默认只显示入口按钮，点击后才展开输入行', async () => {
    const { host } = mount();
    expect(host.querySelector('input')).toBeNull();

    host.querySelector<HTMLElement>('.inline-tag-create__entry')!.click();
    await nextTick();

    expect(host.querySelector('input')).not.toBeNull();
  });

  it('游客在展开阶段就被拦截，不进入输入状态', async () => {
    blockGuestWrite.mockReturnValue(true);
    const { host } = mount();

    host.querySelector<HTMLElement>('.inline-tag-create__entry')!.click();
    await nextTick();

    expect(host.querySelector('input')).toBeNull();
    expect(blockGuestWrite).toHaveBeenCalledOnce();
  });

  it('输入名字后创建成功，抛出 created 并收起输入行', async () => {
    const { host, events } = mount();
    await typeName(host, '  读书笔记  ');

    confirmButton(host).click();
    await nextTick();
    await nextTick();

    // 名字提交前 trim
    expect(apiBasePost).toHaveBeenCalledWith('/api/bookmark/addTag', { name: '读书笔记' });
    expect(events.created).toEqual([{ id: 'tag-new', name: '读书笔记' }]);
    expect(host.querySelector('input')).toBeNull();
  });

  /**
   * 标签库是全量加载的，本地命中就直接复用：用户要的是「让这条资源带上这个标签」，
   * 报一个「已存在」的错只会把他推回去自己搜。同时避开后端 TAG_DUPLICATE。
   */
  it('名字与已有标签重复时直接复用，不发创建请求', async () => {
    const { host, events } = mount([{ id: 'tag-1', name: '读书笔记' }]);
    await typeName(host, '读书笔记');

    confirmButton(host).click();
    await nextTick();

    expect(apiBasePost).not.toHaveBeenCalled();
    expect(events.reused).toEqual([{ id: 'tag-1', name: '读书笔记' }]);
    expect(events.created).toEqual([]);
  });

  it('查重忽略大小写与首尾空格', async () => {
    const { host, events } = mount([{ id: 'tag-1', name: 'SSL' }]);
    await typeName(host, '  ssl ');

    confirmButton(host).click();
    await nextTick();

    expect(apiBasePost).not.toHaveBeenCalled();
    expect(events.reused[0]).toEqual({ id: 'tag-1', name: 'SSL' });
  });

  it('空名或纯空格不提交，也不发请求', async () => {
    const { host } = mount();
    await typeName(host, '   ');

    expect(confirmButton(host).disabled).toBe(true);
    confirmButton(host).click();
    await nextTick();

    expect(apiBasePost).not.toHaveBeenCalled();
  });

  /** 并发或本地列表过期时仍会撞重名，错误码被后端拼进 msg，只能包含匹配。 */
  it('服务端判定重名时提示并请父组件刷新列表，不抛 created', async () => {
    apiBasePost.mockResolvedValue({ status: 500, msg: '服务器内部错误: TAG_DUPLICATE: 标签已存在' });
    const { host, events } = mount();
    await typeName(host, '证书');

    confirmButton(host).click();
    await nextTick();
    await nextTick();

    expect(events.created).toEqual([]);
    expect(events.stale).toEqual([true]);
    expect(warning).toHaveBeenCalledOnce();
  });

  it('其他失败给出通用错误提示，不误报重名', async () => {
    apiBasePost.mockResolvedValue({ status: 500, msg: '服务器内部错误: 连接超时' });
    const { host, events } = mount();
    await typeName(host, '证书');

    confirmButton(host).click();
    await nextTick();
    await nextTick();

    expect(events.created).toEqual([]);
    expect(events.stale).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  it('接口抛异常时不冒泡，只给出失败提示', async () => {
    apiBasePost.mockRejectedValue(new Error('network down'));
    const { host, events } = mount();
    await typeName(host, '证书');

    confirmButton(host).click();
    await nextTick();
    await nextTick();

    expect(events.created).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  /** 连续回车/连点不能创建出两个同名标签。 */
  it('提交进行中不重复发请求', async () => {
    let resolveRequest: (value: any) => void = () => {};
    apiBasePost.mockReturnValue(new Promise((resolve) => (resolveRequest = resolve)));
    const { host } = mount();
    await typeName(host, '证书');

    confirmButton(host).click();
    await nextTick();
    confirmButton(host).click();
    confirmButton(host).click();
    await nextTick();

    expect(apiBasePost).toHaveBeenCalledOnce();

    resolveRequest({ status: 200, data: { id: 'tag-new' } });
    await nextTick();
  });

  it('取消后收起输入行并清空已输入内容', async () => {
    const { host } = mount();
    await typeName(host, '写一半的名字');

    cancelButton(host).click();
    await nextTick();

    expect(host.querySelector('input')).toBeNull();

    // 再次展开应是空输入框，而不是上次残留
    host.querySelector<HTMLElement>('.inline-tag-create__entry')!.click();
    await nextTick();
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('');
  });

  it('限制名字长度，避免建出列表里只能被截断的超长标签', async () => {
    const { host } = mount();
    const input = await typeName(host, 'x');

    expect(input.getAttribute('maxlength')).toBe('50');
  });
});

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

const { default: InlineTagRename } = await import('./InlineTagRename.vue');

let cleanup: (() => void) | undefined;

const TAG = { id: 'tag-1', name: 'SSL' };

function mount(existingTags: { id: string; name: string }[] = [TAG]) {
  const events: Record<string, any[]> = { renamed: [], cancel: [] };
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(InlineTagRename, {
          tag: TAG,
          existingTags,
          onRenamed: (tag: any) => events.renamed.push(tag),
          onCancel: () => events.cancel.push(true),
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

async function typeName(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await nextTick();
  return input;
}

const submitButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('.inline-tag-rename__submit')!;
const cancelButton = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('.inline-tag-rename__cancel')!;

describe('InlineTagRename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blockGuestWrite.mockReturnValue(false);
    isMobile.value = false;
    apiBasePost.mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('打开即带入原名字，便于直接修改', () => {
    const { host } = mount();
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('SSL');
  });

  it('改名成功只提交 id 与 name，不动图标与资源关联', async () => {
    const { host, events } = mount();
    await typeName(host, '  SSL 证书  ');

    submitButton(host).click();
    await nextTick();
    await nextTick();

    // 不传 bookmarkList/noteList/fileList，后端就不会重写关联
    expect(apiBasePost).toHaveBeenCalledWith('/api/bookmark/updateTag', { id: 'tag-1', name: 'SSL 证书' });
    expect(events.renamed).toEqual([{ id: 'tag-1', name: 'SSL 证书' }]);
  });

  /** 名字没变就当取消：省掉一次无意义的写请求，也不弹「改名成功」。 */
  it('名字未改动时按取消处理，不发请求', async () => {
    const { host, events } = mount();
    await typeName(host, '  SSL  ');

    submitButton(host).click();
    await nextTick();

    expect(apiBasePost).not.toHaveBeenCalled();
    expect(events.cancel).toEqual([true]);
    expect(events.renamed).toEqual([]);
  });

  /** 查重要排除自己，否则改大小写都会被自己挡住。 */
  it('与其他标签重名时本地即拦截，且不会被自己挡住', async () => {
    const { host, events } = mount([TAG, { id: 'tag-2', name: '证书' }]);
    await typeName(host, '证书');

    submitButton(host).click();
    await nextTick();

    expect(apiBasePost).not.toHaveBeenCalled();
    expect(events.renamed).toEqual([]);
    expect(warning).toHaveBeenCalledOnce();
  });

  it('只改大小写时不会被自己的旧名判成重复', async () => {
    const { host } = mount([TAG]);
    await typeName(host, 'ssl');

    submitButton(host).click();
    await nextTick();
    await nextTick();

    expect(apiBasePost).toHaveBeenCalledWith('/api/bookmark/updateTag', { id: 'tag-1', name: 'ssl' });
  });

  it('空名不提交', async () => {
    const { host } = mount();
    await typeName(host, '   ');

    expect(submitButton(host).disabled).toBe(true);
    submitButton(host).click();
    await nextTick();

    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it('并发导致服务端判重时给出提示，不抛 renamed', async () => {
    apiBasePost.mockResolvedValue({ status: 500, msg: '服务器内部错误: 标签已存在' });
    const { host, events } = mount();
    await typeName(host, '新名字');

    submitButton(host).click();
    await nextTick();
    await nextTick();

    expect(events.renamed).toEqual([]);
    expect(warning).toHaveBeenCalledOnce();
  });

  it('无权限时给出明确提示', async () => {
    apiBasePost.mockResolvedValue({ status: 403 });
    const { host, events } = mount();
    await typeName(host, '新名字');

    submitButton(host).click();
    await nextTick();
    await nextTick();

    expect(events.renamed).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  it('接口异常时不冒泡，只提示失败', async () => {
    apiBasePost.mockRejectedValue(new Error('network down'));
    const { host, events } = mount();
    await typeName(host, '新名字');

    submitButton(host).click();
    await nextTick();
    await nextTick();

    expect(events.renamed).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  it('提交进行中不重复发请求', async () => {
    let resolveRequest: (value: any) => void = () => {};
    apiBasePost.mockReturnValue(new Promise((resolve) => (resolveRequest = resolve)));
    const { host } = mount();
    await typeName(host, '新名字');

    submitButton(host).click();
    await nextTick();
    submitButton(host).click();
    submitButton(host).click();
    await nextTick();

    expect(apiBasePost).toHaveBeenCalledOnce();
    resolveRequest({ status: 200 });
    await nextTick();
  });

  it('取消时抛 cancel，不发请求', async () => {
    const { host, events } = mount();
    await typeName(host, '改了一半');

    cancelButton(host).click();
    await nextTick();

    expect(apiBasePost).not.toHaveBeenCalled();
    expect(events.cancel).toEqual([true]);
  });

  /** 编辑态占据整行，点击不能冒泡到行本身的「切换绑定」。 */
  it('内部点击不冒泡，避免误触发所在标签行的绑定切换', async () => {
    const outerClick = vi.fn();
    const { host } = mount();
    host.addEventListener('click', outerClick);

    host.querySelector<HTMLElement>('.inline-tag-rename')!.click();
    await nextTick();

    expect(outerClick).not.toHaveBeenCalled();
  });
});

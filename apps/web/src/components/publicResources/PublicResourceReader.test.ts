import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { publicResourcesZh } from '@/i18n/locales/publicResources';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  execute: vi.fn(),
  scope: {} as any,
  refresh: null as any,
  push: vi.fn(),
  busy: null as any,
}));
vi.mock('@/api/publicResources', () => ({ publicGet: mocks.get }));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/composables/usePublicResourceWrite', () => ({
  usePublicResourceWrite: () => ({ busy: mocks.busy, execute: mocks.execute }),
}));
vi.mock('@/composables/useForegroundRefresh', () => ({
  useForegroundRefresh: (options: any) => {
    mocks.refresh = options.refresh;
  },
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => ({ fullPath: '/search?public=1', query: {} }),
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { success: vi.fn() } }));
import Reader from './PublicResourceReader.vue';
const item = {
  publicId: 'public-id',
  kind: 'note',
  title: '公开标题',
  body: '<img src="private.invalid"> 只读内容',
  url: '',
  description: '',
  summary: '只读内容',
  origin: 'public',
  author: { name: '公开作者' },
  publishedAt: '2026-10-21T09:00:00Z',
  revision: 1,
  version: 2,
};
let app: ReturnType<typeof createApp>, host: HTMLElement;
const initialViewportWidth = window.innerWidth;
async function settle() {
  for (let i = 0; i < 6; i++) await nextTick();
}
function button(label: string, root: ParentNode = host) {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
}
async function mount(embedded = true, onBack = vi.fn()) {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(Reader, { resourceId: 'public-id', embedded, onBack }) });
  app.component('svg-icon', { template: '<span />' });
  app.directive('auto-scrollbar', {});
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { publicResources: publicResourcesZh } },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  app.mount(host);
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockReset();
  mocks.execute.mockReset();
  mocks.scope = reactive({ identity: 'one', eligible: true });
  mocks.busy = ref(false);
  mocks.get.mockResolvedValue(item);
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: initialViewportWidth });
});
describe('公开资源只读边界', () => {
  it('纯文本展示，只有保存、阅读全文和举报；保存携带当前版本', async () => {
    await mount();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain(item.body);
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(['保存为我的笔记', '阅读全文', '举报']);
    mocks.execute.mockResolvedValue({ id: 'own-copy', kind: 'note', existing: true, inTrash: true });
    host.querySelector<HTMLButtonElement>('button')!.click();
    await settle();
    expect(mocks.execute).toHaveBeenCalledWith('public-id/save', { expectedVersion: 2 });
    expect(host.textContent).toContain('副本在回收站');
  });
  it('恢复前台先清除旧正文，失效响应后不保留旧公开快照', async () => {
    await mount();
    let fail!: (error: Error) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const refreshing = mocks.refresh();
    await settle();
    expect(host.querySelector('article')).toBeNull();
    fail(Object.assign(new Error('withdrawn'), { status: 404, code: 'PUBLIC_RESOURCE_UNAVAILABLE' }));
    await refreshing;
    await settle();
    expect(host.textContent).toContain('此资源已失效');
    expect(host.textContent).not.toContain(item.body);
  });
  it('切号丢弃原账号在途正文', async () => {
    let finish!: (value: any) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    mocks.scope.eligible = false;
    mocks.scope.identity = 'two';
    await settle();
    finish(item);
    await settle();
    expect(mocks.get.mock.calls[0][2].aborted).toBe(true);
    expect(host.textContent).not.toContain(item.body);
    expect(host.querySelector('article')).toBeNull();
    expect(host.textContent).toContain('此资源已失效');
  });
});

describe('公开详情阅读与操作', () => {
  it('桌面与手机切换只迁移操作区，保留保存结果且不重复提交', async () => {
    await mount(false);
    mocks.execute.mockResolvedValue({ id: 'own-copy', kind: 'note', existing: false, inTrash: false });
    button('保存为我的笔记')!.click();
    await settle();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    await settle();
    expect(host.querySelectorAll('.mobile-sticky-action-bar')).toHaveLength(1);
    expect(button('保存为我的笔记')).toBeUndefined();
    expect(button('举报')).toBeDefined();
    button('打开我的副本')!.click();
    expect(mocks.push).toHaveBeenCalledWith('/noteLibrary/own-copy');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1470 });
    window.dispatchEvent(new Event('resize'));
    await settle();
    expect(host.querySelector('.mobile-sticky-action-bar')).toBeNull();
    expect(button('打开我的副本')).toBeDefined();
    expect(button('举报此资源')).toBeDefined();
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it('独立阅读页只展示公开身份和原样纯文字，不解析 HTML 或 Markdown', async () => {
    mocks.get.mockResolvedValue({ ...item, body: '# 不转成标题\n\n' + item.body });
    await mount(false);
    expect(host.querySelector('h1')?.textContent).toBe(item.title);
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('h2, img')).toBeNull();
    expect(host.querySelector('.public-reader-text')?.textContent).toBe('# 不转成标题\n\n' + item.body);
    expect(host.querySelector('.public-reader-author')?.textContent).toContain(item.author.name);
    expect(host.querySelector('.public-reader-avatar')?.textContent).toBe('公');
    expect(host.querySelector('time')?.dateTime).toBe(item.publishedAt);
    expect(button('阅读全文')).toBeUndefined();
    expect(button('保存为我的笔记')).toBeDefined();
    expect(button('举报此资源')).toBeDefined();
  });
  it('书签的链接区域与打开网站保留完整网址和安全的新窗口属性', async () => {
    const url = 'https://example.org/very-long/path?language=zh#topic';
    mocks.get.mockResolvedValue({ ...item, kind: 'bookmark', body: '', url, description: item.body });
    await mount(false);
    const links = [...host.querySelectorAll('a')];
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(url);
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    }
    expect(links[0].textContent).toContain('example.org/very-long/path?language=zh#topic');
    expect(links[1].textContent).toContain('打开网站');
    expect(host.querySelector('.public-reader-text')?.textContent).toBe(item.body);
  });
  it('保存成功后突出打开副本，前台刷新同版保留结果，新修订允许保存新副本', async () => {
    await mount(false);
    mocks.execute.mockResolvedValue({ id: 'own-copy', kind: 'note', existing: false, inTrash: false });
    button('保存为我的笔记')!.click();
    await settle();
    expect(mocks.execute).toHaveBeenCalledWith('public-id/save', { expectedVersion: 2 });
    expect(button('保存为我的笔记')).toBeUndefined();
    button('打开我的副本')!.click();
    expect(mocks.push).toHaveBeenCalledWith('/noteLibrary/own-copy');
    await mocks.refresh();
    await settle();
    expect(button('打开我的副本')).toBeDefined();
    mocks.get.mockResolvedValueOnce({ ...item, revision: 2, version: 4 });
    await mocks.refresh();
    await settle();
    expect(button('打开我的副本')).toBeUndefined();
    button('保存为我的笔记')!.click();
    await settle();
    expect(mocks.execute).toHaveBeenLastCalledWith('public-id/save', { expectedVersion: 4 });
  });
  it('同网址已有书签时提示保留原内容，并定位到已有书签', async () => {
    mocks.get.mockResolvedValue({ ...item, kind: 'bookmark', url: 'https://example.org', description: '公开说明' });
    await mount(false);
    mocks.execute.mockResolvedValue({ id: 'existing-bookmark', kind: 'bookmark', existing: true, inTrash: false });
    button('保存为我的书签')!.click();
    await settle();
    expect(host.textContent).toContain('已保留你的标题与说明');
    expect(button('保存为我的书签')).toBeUndefined();
    button('打开我的副本')!.click();
    expect(mocks.push).toHaveBeenCalledWith({ path: '/home', query: { locate: 'existing-bookmark' } });
  });
  it('回收站副本提供恢复入口，不重复创建', async () => {
    await mount(false);
    mocks.execute.mockResolvedValue({ id: 'trashed-copy', kind: 'note', existing: true, inTrash: true });
    button('保存为我的笔记')!.click();
    await settle();
    expect(host.textContent).toContain('副本在回收站');
    expect(button('保存为我的笔记')).toBeUndefined();
    button('打开回收站')!.click();
    expect(mocks.push).toHaveBeenCalledWith('/trash');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('保存版本冲突后刷新公开内容并保留操作提示', async () => {
    await mount(false);
    mocks.execute.mockRejectedValue({ code: 'PUBLIC_RESOURCE_VERSION_CONFLICT', status: 409 });
    mocks.get.mockResolvedValueOnce({ ...item, title: '新的公开版', version: 3, revision: 2 });
    button('保存为我的笔记')!.click();
    await settle();
    expect(host.querySelector('h1')?.textContent).toBe('新的公开版');
    expect(host.textContent).toContain(publicResourcesZh.detail.refreshedState);
    expect(button('保存为我的笔记')).toBeDefined();
  });
  it('操作未确认时保留重试入口与同一公开版本，不提前展示已保存', async () => {
    await mount(false);
    mocks.execute.mockRejectedValueOnce({ code: 'ETIMEDOUT', status: 408 });
    button('保存为我的笔记')!.click();
    await settle();
    expect(host.textContent).toContain('操作暂未完成');
    expect(button('打开我的副本')).toBeUndefined();
    mocks.execute.mockResolvedValue({ id: 'confirmed-copy', kind: 'note', existing: true, inTrash: false });
    button('保存为我的笔记')!.click();
    await settle();
    expect(mocks.execute.mock.calls).toEqual([
      ['public-id/save', { expectedVersion: 2 }],
      ['public-id/save', { expectedVersion: 2 }],
    ]);
    expect(button('打开我的副本')).toBeDefined();
  });
  it('保存时权限失效会重新核验，失效后移除正文与保存入口', async () => {
    await mount(false);
    mocks.execute.mockRejectedValue({ code: 'PUBLIC_RESOURCE_UNAVAILABLE', status: 404 });
    mocks.get.mockRejectedValueOnce({ code: 'PUBLIC_RESOURCE_UNAVAILABLE', status: 404 });
    button('保存为我的笔记')!.click();
    await settle();
    expect(host.querySelector('article')).toBeNull();
    expect(host.textContent).not.toContain(item.body);
    expect(button('保存为我的笔记')).toBeUndefined();
    expect(button('返回来源页面')).toBeDefined();
  });
  it('举报使用当前公开修订及填写原因，空原因不能提交', async () => {
    await mount(false);
    button('举报此资源')!.click();
    await settle();
    const modal = document.querySelector('[role="dialog"]')!;
    const submit = button('提交举报', modal)!;
    expect(submit.disabled).toBe(true);
    const textarea = modal.querySelector('textarea')!;
    textarea.value = '  说明中包含需要核实的信息  ';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(submit.disabled).toBe(false);
    mocks.execute.mockResolvedValue({ reportId: 'report-id' });
    submit.click();
    await settle();
    expect(mocks.execute).toHaveBeenCalledWith('public-id/report', { revision: 1, reason: '说明中包含需要核实的信息' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('举报时公开版已更新，重新读取内容并要求重新确认，不把旧举报自动提交到新版', async () => {
    await mount(false);
    button('举报此资源')!.click();
    await settle();
    const modal = document.querySelector('[role="dialog"]')!;
    const textarea = modal.querySelector('textarea')!;
    textarea.value = '旧版需要核实';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    mocks.execute.mockRejectedValueOnce({ code: 'PUBLIC_RESOURCE_VERSION_CONFLICT', status: 409 });
    mocks.get.mockResolvedValueOnce({ ...item, title: '新的公开版', revision: 2, version: 4 });
    button('提交举报', modal)!.click();
    await settle();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledWith('public-id/report', { revision: 1, reason: '旧版需要核实' });
    expect(host.querySelector('h1')?.textContent).toBe('新的公开版');
    expect(host.textContent).toContain(publicResourcesZh.detail.refreshedState);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('举报时作者已撤回，重新核验后移除旧正文和操作', async () => {
    await mount(false);
    button('举报此资源')!.click();
    await settle();
    const modal = document.querySelector('[role="dialog"]')!;
    const textarea = modal.querySelector('textarea')!;
    textarea.value = '需要核实';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    mocks.execute.mockRejectedValueOnce({ code: 'PUBLIC_RESOURCE_UNAVAILABLE', status: 404 });
    mocks.get.mockRejectedValueOnce({ code: 'PUBLIC_RESOURCE_UNAVAILABLE', status: 404 });
    button('提交举报', modal)!.click();
    await settle();
    expect(host.querySelector('article')).toBeNull();
    expect(host.textContent).not.toContain(item.body);
    expect(button('保存为我的笔记')).toBeUndefined();
    expect(button('返回来源页面')).toBeDefined();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('举报网络失败保留填写内容和当前修订，允许用户重试', async () => {
    await mount(false);
    button('举报此资源')!.click();
    await settle();
    const modal = document.querySelector('[role="dialog"]')!;
    const textarea = modal.querySelector('textarea')!;
    textarea.value = '保留这段举报原因';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    mocks.execute.mockRejectedValueOnce({ code: 'ETIMEDOUT', status: 408 });
    button('提交举报', modal)!.click();
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(textarea.value).toBe('保留这段举报原因');
    expect(host.querySelector('h1')?.textContent).toBe(item.title);
    expect(mocks.get).toHaveBeenCalledOnce();
    mocks.execute.mockResolvedValueOnce({ reportId: 'report-id' });
    button('提交举报', modal)!.click();
    await settle();
    expect(mocks.execute.mock.calls).toEqual([
      ['public-id/report', { revision: 1, reason: '保留这段举报原因' }],
      ['public-id/report', { revision: 1, reason: '保留这段举报原因' }],
    ]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('处理中禁用保存和举报，切号后丢弃迟到的保存结果', async () => {
    await mount(false);
    mocks.busy.value = true;
    await settle();
    expect(button('保存为我的笔记')?.disabled).toBe(true);
    expect(button('举报此资源')?.disabled).toBe(true);
    mocks.busy.value = false;
    await settle();
    let finish!: (value: unknown) => void;
    mocks.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button('保存为我的笔记')!.click();
    mocks.scope.eligible = false;
    mocks.scope.identity = 'two';
    await settle();
    finish({ id: 'old-copy', kind: 'note', existing: false, inTrash: false });
    await settle();
    expect(host.querySelector('article')).toBeNull();
    expect(button('打开我的副本')).toBeUndefined();
  });
  it('失效响应隐藏内容和操作，返回按钮交给来源导航；网络失败提供重试', async () => {
    const back = vi.fn();
    mocks.get.mockRejectedValueOnce({ status: 404, code: 'PUBLIC_RESOURCE_UNAVAILABLE' });
    await mount(false, back);
    expect(host.textContent).toContain('这个公开资源已不可用');
    expect(host.querySelector('article')).toBeNull();
    expect(button('保存为我的笔记')).toBeUndefined();
    button('返回来源页面')!.click();
    expect(back).toHaveBeenCalledOnce();
    mocks.get.mockRejectedValueOnce({ status: 503 });
    await mocks.refresh();
    await settle();
    expect(host.textContent).toContain('暂时无法加载此资源');
    expect(host.textContent).not.toContain('这个公开资源已不可用');
    button('重试')!.click();
    await settle();
    expect(host.querySelector('h1')?.textContent).toBe(item.title);
  });
});

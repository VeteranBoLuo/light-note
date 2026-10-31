import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { getFeatureShortcut } from '@/config/featureShortcuts';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  getFeatured: vi.fn(),
  saveFeatured: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { open: mocks.open } }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/updateLogApi', () => ({
  getFeaturedFeatures: mocks.getFeatured,
  saveFeaturedFeatures: mocks.saveFeatured,
}));
vi.mock('@/i18n', () => ({ default: { global: { t: (key: string) => key } } }));
vi.mock('@/http/request', () => ({ apiBasePost: mocks.post }));

const { runFeatureShortcut, useFeatureIntent, useFeaturedFeatures } = await import('./useFeatureShortcuts');

const router = { push: vi.fn(async () => undefined) } as any;
let cleanup: (() => void) | undefined;

function mountWithIntent(
  handler: () => void,
  options: { keepAlive?: boolean; intent?: 'ai-organize' | 'note-reference' } = {},
) {
  const Page = defineComponent({
    setup() {
      useFeatureIntent(options.intent || 'ai-organize', handler);
      return () => h('div', 'page');
    },
  });
  const Other = defineComponent({ render: () => h('div', 'other') });
  const showPage = ref(true);
  const app = createApp({
    render: () =>
      options.keepAlive ? h(KeepAlive, null, [h(showPage.value ? Page : Other)]) : h(showPage.value ? Page : Other),
  });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return showPage;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('功能直达动作', () => {
  it('目标页已激活时接住一次，不再显示兜底提示', async () => {
    const handler = vi.fn();
    mountWithIntent(handler);
    await nextTick();
    await runFeatureShortcut(getFeatureShortcut('ai-organize')!, router, '');
    await nextTick();
    expect(router.push).toHaveBeenCalledWith({ path: '/manage/bookmarkMg' });
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('没有页面接住时显示可关闭的提示（时长单位是秒），之后挂载的页面不会再补执行', async () => {
    await runFeatureShortcut(getFeatureShortcut('ai-organize')!, router, '');
    vi.advanceTimersByTime(700);
    expect(mocks.open).toHaveBeenCalledWith({
      type: 'info',
      content: 'featureShortcut.items.aiOrganize.hint',
      duration: 10,
      key: 'feature-shortcut-hint-ai-organize',
      closable: true,
    });
    const handler = vi.fn();
    mountWithIntent(handler);
    await nextTick();
    expect(handler).not.toHaveBeenCalled();
  });

  it('keep-alive 缓存在后台的页面不抢先执行，重新激活后再接住', async () => {
    const handler = vi.fn();
    const showPage = mountWithIntent(handler, { keepAlive: true });
    await nextTick();
    showPage.value = false;
    await nextTick();
    await runFeatureShortcut(getFeatureShortcut('ai-organize')!, router, '');
    await nextTick();
    expect(handler).not.toHaveBeenCalled();
    showPage.value = true;
    await nextTick();
    await nextTick();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('没有提示的打开型功能只跳转', async () => {
    await runFeatureShortcut(getFeatureShortcut('trash')!, router, '');
    vi.advanceTimersByTime(1000);
    expect(router.push).toHaveBeenCalledWith({ path: '/trash' });
    expect(mocks.open).not.toHaveBeenCalled();
  });
});

describe('笔记参考栏直达', () => {
  const feature = getFeatureShortcut('note-reference')!;
  const routerAt = (name: string) => ({ push: vi.fn(async () => undefined), currentRoute: { value: { name } } }) as any;

  it('打开笔记库根层第一篇非手绘笔记，并由详情页切到参考', async () => {
    mocks.post.mockResolvedValueOnce({
      status: 200,
      data: { items: [{ id: 'd1', type: 'drawing' }, { id: 'n 2', type: 'markdown' }, { id: 'n3', type: 'html' }] },
    });
    const listRouter = routerAt('workbenches');
    await runFeatureShortcut(feature, listRouter, '');
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/note/queryNoteList',
      expect.objectContaining({ page: 1, parentId: null }),
      expect.anything(),
    );
    expect(listRouter.push).toHaveBeenCalledWith({ path: '/noteLibrary/n%202' });
    const handler = vi.fn();
    mountWithIntent(handler, { intent: 'note-reference' });
    await nextTick();
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('未开启页面树时退回不分层列表', async () => {
    mocks.post
      .mockResolvedValueOnce({ status: 403, data: null })
      .mockResolvedValueOnce({ status: 200, data: { items: [{ id: 'n1' }] } });
    const listRouter = routerAt('home');
    await runFeatureShortcut(feature, listRouter, '');
    expect(mocks.post.mock.calls[1][1]).not.toHaveProperty('parentId');
    expect(listRouter.push).toHaveBeenCalledWith({ path: '/noteLibrary/n1' });
  });

  it('没有可参考的笔记时进入笔记库并提示先新建', async () => {
    mocks.post.mockResolvedValueOnce({ status: 200, data: { items: [{ id: 'd1', type: 'drawing' }] } });
    const listRouter = routerAt('home');
    await runFeatureShortcut(feature, listRouter, '');
    expect(listRouter.push).toHaveBeenCalledWith({ path: '/noteLibrary' });
    vi.advanceTimersByTime(700);
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'featureShortcut.items.noteReference.emptyHint', closable: true }),
    );
  });
});

describe('最近上线读模型', () => {
  it('短时缓存，读取失败保留上一次内容；保存成功后直接替换', async () => {
    const featured = useFeaturedFeatures();
    const item = { featureId: 'manor', description: '', publishDate: '2026-10-30' };
    mocks.getFeatured.mockResolvedValueOnce({ status: 200, data: { items: [item] } });
    await featured.ensure(true);
    await featured.ensure();
    expect(mocks.getFeatured).toHaveBeenCalledTimes(1);
    expect(featured.state.items).toEqual([item]);

    mocks.getFeatured.mockRejectedValueOnce(new Error('offline'));
    await featured.ensure(true);
    expect(featured.state.failed).toBe(true);
    expect(featured.state.items).toEqual([item]);

    const next = { ...item, featureId: 'trash' };
    mocks.saveFeatured.mockResolvedValueOnce({ status: 200, data: { items: [next] } });
    await expect(featured.save([next])).resolves.toBe(true);
    expect(featured.state.items).toEqual([next]);
    mocks.saveFeatured.mockResolvedValueOnce({ status: 403, data: null });
    await expect(featured.save([])).resolves.toBe(false);
    expect(featured.state.items).toEqual([next]);
  });
});

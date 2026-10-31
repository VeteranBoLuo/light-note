import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { getFeatureShortcut } from '@/config/featureShortcuts';

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  getFeatured: vi.fn(),
  saveFeatured: vi.fn(),
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { info: mocks.info } }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/updateLogApi', () => ({
  getFeaturedFeatures: mocks.getFeatured,
  saveFeaturedFeatures: mocks.saveFeatured,
}));
vi.mock('@/i18n', () => ({ default: { global: { t: (key: string) => key } } }));

const { runFeatureShortcut, useFeatureIntent, useFeaturedFeatures } = await import('./useFeatureShortcuts');

const router = { push: vi.fn(async () => undefined) } as any;
let cleanup: (() => void) | undefined;

function mountWithIntent(handler: () => void, options: { keepAlive?: boolean } = {}) {
  const Page = defineComponent({
    setup() {
      useFeatureIntent('ai-organize', handler);
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
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('没有页面接住时显示提示，之后挂载的页面不会再补执行', async () => {
    await runFeatureShortcut(getFeatureShortcut('ai-organize')!, router, '');
    vi.advanceTimersByTime(700);
    expect(mocks.info).toHaveBeenCalledWith('featureShortcut.items.aiOrganize.hint', 7000);
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
    expect(mocks.info).not.toHaveBeenCalled();
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

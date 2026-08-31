import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const recap = ref<any>(null);
const recapLoading = ref(false);
const recapError = ref(false);
const loadRecap = vi.fn();
const setRecapState = vi.fn();
const routerPush = vi.fn();
const currentRoute = ref({ fullPath: '/workbenches' });
const alert = vi.fn();
const messageSuccess = vi.fn();
const messageError = vi.fn();
const recordOperation = vi.fn();
const openBookmarkUrl = vi.fn();

vi.doMock('@/composables/useGrowth.ts', () => ({
  useGrowth: () => ({ recap, recapLoading, recapError, loadRecap, setRecapState }),
}));
vi.doMock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, currentRoute }),
}));
vi.doMock('@/components/base/BasicComponents/BModal/Alert.ts', () => ({
  default: { alert },
}));
vi.doMock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: messageSuccess, error: messageError },
}));
vi.doMock('@/api/commonApi.ts', () => ({ recordOperation }));
vi.doMock('@/utils/openBookmark.ts', () => ({ openBookmarkUrl }));
vi.doMock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i class="svg-icon-stub" />' },
}));

const { default: DailyReviewCard } = await import('./DailyReviewCard.vue');

let cleanup: (() => void) | undefined;

function item(overrides: Partial<any> = {}) {
  return {
    type: 'note',
    id: 'note-1',
    title: '第一条笔记',
    url: null,
    time: '2026-08-20 09:00:00',
    ...overrides,
  };
}

function mountCard(readOnly = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(DailyReviewCard, { readOnly }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe('DailyReviewCard', () => {
  beforeEach(() => {
    recap.value = null;
    recapLoading.value = false;
    recapError.value = false;
    currentRoute.value = { fullPath: '/workbenches' };
    vi.clearAllMocks();
    loadRecap.mockResolvedValue(null);
    setRecapState.mockResolvedValue({ status: 200, data: { ok: true } });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('首次读取使用 BLoading，加载失败后提供局部重试', async () => {
    recapLoading.value = true;
    const loadingHost = mountCard();
    expect(loadingHost.textContent).toContain(zhCN.growth.dailyReviewLoading);
    expect(loadingHost.querySelector('[role="status"]')).not.toBeNull();
    cleanup?.();
    cleanup = undefined;

    recapLoading.value = false;
    recapError.value = true;
    const errorHost = mountCard();
    expect(errorHost.textContent).toContain(zhCN.growth.dailyReviewLoadFailedTitle);
    errorHost.querySelector<HTMLButtonElement>('.daily-review__retry')?.click();
    await settle();

    expect(loadRecap).toHaveBeenCalledWith(true);
  });

  it('只展示有内容的分类，并可在当前分类稳定切换下一条', async () => {
    recap.value = {
      weekly: [item(), item({ id: 'note-2', title: '第二条笔记' })],
      onThisDay: [item({ type: 'bookmark', id: 'bookmark-1', title: '往年的书签', url: 'https://example.com' })],
      buried: [],
      stableDate: '2026-08-28',
    };
    const host = mountCard();

    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(host.textContent).toContain(zhCN.growth.recapRecent);
    expect(host.textContent).toContain('第一条笔记');
    expect(host.textContent).not.toContain(zhCN.growth.recapBuried);

    host.querySelector<HTMLButtonElement>('.daily-review__next')?.click();
    await nextTick();

    expect(host.textContent).toContain('第二条笔记');
    expect(host.textContent).toContain('第 2 条，共 2 条');
  });

  it('打开笔记时保留工作台返回来源，打开书签时走统一外链偏好', async () => {
    recap.value = { weekly: [item()], onThisDay: [], buried: [] };
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__open')?.click();
    await nextTick();

    expect(routerPush).toHaveBeenCalledWith({
      path: '/noteLibrary/note-1',
      query: { from: '/workbenches' },
    });
    expect(recordOperation).toHaveBeenCalledTimes(1);

    cleanup?.();
    cleanup = undefined;
    recordOperation.mockClear();
    recap.value = {
      weekly: [item({ type: 'bookmark', id: 'bookmark-1', url: 'https://example.com' })],
      onThisDay: [],
      buried: [],
    };
    const bookmarkHost = mountCard();
    bookmarkHost.querySelector<HTMLButtonElement>('.daily-review__open')?.click();

    expect(openBookmarkUrl).toHaveBeenCalledWith('https://example.com');
    expect(recordOperation).toHaveBeenCalledTimes(1);
  });

  it('稍后提醒直接更新，永久隐藏必须经过 BAlert 危险确认', async () => {
    const reviewItem = item();
    recap.value = { weekly: [reviewItem], onThisDay: [], buried: [] };
    const host = mountCard();

    host.querySelector<HTMLButtonElement>('.daily-review__snooze')?.click();
    await settle();
    expect(setRecapState).toHaveBeenCalledWith(reviewItem, 'snooze_7d');
    expect(messageSuccess).toHaveBeenCalledWith(zhCN.growth.recapSnoozed);

    host.querySelector<HTMLButtonElement>('.daily-review__dismiss')?.click();
    expect(alert).toHaveBeenCalledTimes(1);
    const confirmation = alert.mock.calls[0]?.[0];
    expect(confirmation).toMatchObject({
      title: zhCN.growth.dailyReviewDismissConfirmTitle,
      okType: 'danger',
      cancelText: zhCN.common.cancel,
    });
    confirmation.onOk();
    await settle();
    expect(setRecapState).toHaveBeenLastCalledWith(reviewItem, 'dismiss');
  });

  it('管理员只读预览保留内容打开能力，但不渲染偏好写操作', () => {
    recap.value = { weekly: [item()], onThisDay: [], buried: [] };
    const host = mountCard(true);

    expect(host.textContent).toContain(zhCN.growth.dailyReviewReadOnly);
    expect(host.querySelector('.daily-review__open')).not.toBeNull();
    expect(host.querySelector('.daily-review__snooze')).toBeNull();
    expect(host.querySelector('.daily-review__dismiss')).toBeNull();
  });

  it('有旧数据的刷新错误保留内容并显示局部陈旧提示', () => {
    recap.value = { weekly: [item()], onThisDay: [], buried: [] };
    recapError.value = true;
    const host = mountCard();

    expect(host.textContent).toContain('第一条笔记');
    expect(host.textContent).toContain(zhCN.growth.dailyReviewStale);
  });
});

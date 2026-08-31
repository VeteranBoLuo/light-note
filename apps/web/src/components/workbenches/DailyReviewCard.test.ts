import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import type { DailyReviewSnapshot } from '@/api/dailyReviewApi.ts';
import zhCN from '@/i18n/locales/zh-CN';

const review = ref<DailyReviewSnapshot | null>(null);
const loading = ref(false);
const error = ref(false);
const actionError = ref(false);
const failedAction = ref(null);
const loadDailyReview = vi.fn();
const actOnItem = vi.fn();
const actOnToday = vi.fn();
const retryFailedAction = vi.fn();
const routerPush = vi.fn();
const currentRoute = ref({ fullPath: '/workbenches' });
const alert = vi.fn();
const messageSuccess = vi.fn();
const recordOperation = vi.fn();
const openBookmarkUrl = vi.fn();
const user = {
  id: 'user-1',
  role: 'user',
  adminContext: null as null | { id: string; subjectUserId: string; mode: 'readonly' | 'maintain' },
};

vi.doMock('@/composables/useDailyReview.ts', () => ({
  useDailyReview: () => ({
    review,
    loading,
    error,
    actionError,
    failedAction,
    loadDailyReview,
    actOnItem,
    actOnToday,
    retryFailedAction,
  }),
}));
vi.doMock('@/store', () => ({ useUserStore: () => user }));
vi.doMock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, currentRoute }),
}));
vi.doMock('@/components/base/BasicComponents/BModal/Alert.ts', () => ({
  default: { alert },
}));
vi.doMock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: messageSuccess },
}));
vi.doMock('@/api/commonApi.ts', () => ({ recordOperation }));
vi.doMock('@/utils/openBookmark.ts', () => ({ openBookmarkUrl }));
vi.doMock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i class="svg-icon-stub" />' },
}));

const { default: DailyReviewCard } = await import('./DailyReviewCard.vue');

let cleanup: (() => void) | undefined;

function item(overrides: Partial<DailyReviewSnapshot['items'][number]> = {}): DailyReviewSnapshot['items'][number] {
  return {
    id: 'daily-item-1',
    slot: 1,
    resourceType: 'note',
    resourceId: 'note-1',
    title: '第一条笔记',
    url: null,
    time: '2025-09-01 09:00:00',
    resourceDate: '2025-09-01',
    reasonCode: 'on_this_day',
    reasonTag: null,
    action: 'pending',
    ...overrides,
  };
}

function snapshot(overrides: Partial<DailyReviewSnapshot> = {}): DailyReviewSnapshot {
  return {
    generated: true,
    date: '2026-09-01',
    timezone: 'Asia/Singapore',
    session: { id: 'session-1', status: 'active', itemCount: 1 },
    progress: { done: 0, total: 1, pending: 1 },
    items: [item()],
    ...overrides,
  };
}

function mutationResponse(nextReview: DailyReviewSnapshot) {
  return { status: 200, data: { ok: true as const, review: nextReview } };
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

function unmountCard() {
  cleanup?.();
  cleanup = undefined;
}

describe('DailyReviewCard', () => {
  beforeEach(() => {
    review.value = null;
    loading.value = false;
    error.value = false;
    actionError.value = false;
    failedAction.value = null;
    user.id = 'user-1';
    user.role = 'user';
    user.adminContext = null;
    currentRoute.value = { fullPath: '/workbenches' };
    vi.clearAllMocks();
    loadDailyReview.mockResolvedValue(null);
    actOnItem.mockImplementation(async () => mutationResponse(review.value!));
    actOnToday.mockImplementation(async () => mutationResponse(review.value!));
    retryFailedAction.mockResolvedValue(null);
    openBookmarkUrl.mockImplementation((url: string, options?: { beforeNavigate?: () => void }) => {
      if (url.startsWith('javascript:')) return false;
      options?.beforeNavigate?.();
      return true;
    });
  });

  afterEach(() => {
    unmountCard();
    document.body.querySelectorAll('.b-action-menu-panel').forEach((element) => element.remove());
  });

  it('首次读取显示局部加载和错误重试，访客不渲染空卡', async () => {
    loading.value = true;
    const loadingHost = mountCard();
    expect(loadingHost.textContent).toContain(zhCN.growth.dailyReviewLoading);
    unmountCard();

    loading.value = false;
    error.value = true;
    const errorHost = mountCard();
    expect(errorHost.textContent).toContain(zhCN.growth.dailyReviewLoadFailedTitle);
    errorHost.querySelector<HTMLButtonElement>('.daily-review__retry')?.click();
    await settle();
    expect(loadDailyReview).toHaveBeenLastCalledWith({ force: true, ensure: true });
    unmountCard();

    error.value = false;
    loadDailyReview.mockClear();
    user.role = 'visitor';
    const visitorHost = mountCard();
    expect(visitorHost.querySelector('.daily-review')).toBeNull();
    expect(loadDailyReview).not.toHaveBeenCalled();
  });

  it('root 本人可生成和操作，代管上下文只 GET 且不写状态', async () => {
    user.role = 'root';
    review.value = snapshot();
    const rootHost = mountCard();
    await settle();
    expect(loadDailyReview).toHaveBeenCalledWith({ ensure: true });
    rootHost.querySelector<HTMLButtonElement>('.daily-review__skip')?.click();
    await settle();
    expect(actOnToday).toHaveBeenCalledWith('skip_today');
    unmountCard();

    vi.clearAllMocks();
    user.adminContext = { id: 'context-1', subjectUserId: 'user-2', mode: 'readonly' };
    const adminHost = mountCard();
    await settle();
    expect(loadDailyReview).toHaveBeenCalledWith({ ensure: false });
    expect(adminHost.textContent).toContain(zhCN.growth.dailyReviewReadOnly);
    expect(adminHost.textContent).not.toContain(zhCN.growth.dailyReviewSkipToday);
    adminHost.querySelector<HTMLButtonElement>('.daily-review__open')?.click();
    expect(routerPush).toHaveBeenCalled();
    expect(actOnItem).not.toHaveBeenCalled();
  });

  it('按 slot 展示当日三条，并让换一条后的当前位置跟随实际条目', async () => {
    review.value = snapshot({
      session: { id: 'session-1', status: 'active', itemCount: 3 },
      progress: { done: 0, total: 3, pending: 3 },
      items: [
        item({ id: 'daily-item-3', slot: 3, title: '第三条' }),
        item({ id: 'daily-item-1', slot: 1, title: '第一条' }),
        item({ id: 'daily-item-2', slot: 2, title: '第二条' }),
      ],
    });
    const host = mountCard();
    expect(host.textContent).toContain('第一条');
    expect(host.textContent).toContain('第 1 条，共 3 条');

    host.querySelector<HTMLButtonElement>('.daily-review__next')?.click();
    await nextTick();
    expect(host.textContent).toContain('第二条');
    expect(host.textContent).toContain('第 2 条，共 3 条');
  });

  it('资源失效被剔除后按有效条目重排位置，不出现 3/2', async () => {
    review.value = snapshot({
      session: { id: 'session-1', status: 'active', itemCount: 2 },
      progress: { done: 0, total: 2, pending: 2 },
      items: [
        item({ id: 'daily-item-1', slot: 1, title: '第一条' }),
        item({ id: 'daily-item-3', slot: 3, title: '第三槽有效内容' }),
      ],
    });
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__next')?.click();
    await nextTick();

    expect(host.textContent).toContain('第 2 条，共 2 条');
    expect(host.textContent).not.toContain('第 3 条，共 2 条');
  });

  it('展示日期与年份只使用账号时区固化的 resourceDate，不受无时区 time 冲突影响', () => {
    review.value = snapshot({
      items: [
        item({
          resourceDate: '2024-09-01',
          time: '2025-12-31 23:59:59',
          reasonCode: 'on_this_day',
        }),
      ],
    });
    const host = mountCard();
    const date = host.querySelector<HTMLTimeElement>('.daily-review__item-meta time');

    expect(date?.dateTime).toBe('2024-09-01');
    expect(date?.textContent).toBe('2024年9月1日');
    expect(host.textContent).toContain('2 年前的今天记录');
    expect(host.textContent).not.toContain('1 年前的今天记录');
  });

  it('沉淀时长使用 resourceDate，旧条目仅在 resourceDate 为空时回退 time 日期', () => {
    review.value = snapshot({
      items: [
        item({
          resourceDate: '2024-01-15',
          time: '2026-08-31 23:59:59',
          reasonCode: 'buried',
        }),
      ],
    });
    const buriedHost = mountCard();
    expect(buriedHost.textContent).toContain('这条内容已沉淀 2 年');
    unmountCard();

    review.value = snapshot({
      items: [item({ resourceDate: null, time: '2025-09-01 23:59:59', reasonCode: 'on_this_day' })],
    });
    const legacyHost = mountCard();
    expect(legacyHost.querySelector<HTMLTimeElement>('.daily-review__item-meta time')?.dateTime).toBe('2025-09-01');
    expect(legacyHost.textContent).toContain('1 年前的今天记录');
  });

  it('内部资源先发 keepalive 状态写入再导航，导航不等待接口', () => {
    review.value = snapshot();
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__open')?.click();

    expect(actOnItem).toHaveBeenCalledWith('daily-item-1', 'open', { keepalive: true });
    expect(routerPush).toHaveBeenCalledWith({
      path: '/noteLibrary/note-1',
      query: { from: '/workbenches' },
    });
    expect(actOnItem.mock.invocationCallOrder[0]).toBeLessThan(routerPush.mock.invocationCallOrder[0]);
  });

  it('文件使用正式深链，标签入口只对 active_tag 开放并同样可靠写入', async () => {
    review.value = snapshot({
      items: [item({ resourceType: 'file', resourceId: 'file-1', title: '旧文件' })],
    });
    const fileHost = mountCard();
    fileHost.querySelector<HTMLButtonElement>('.daily-review__open')?.click();
    expect(actOnItem).toHaveBeenCalledWith('daily-item-1', 'open', { keepalive: true });
    expect(routerPush).toHaveBeenCalledWith({ path: '/cloudSpace', query: { fileId: 'file-1', fileName: '旧文件' } });
    unmountCard();

    vi.clearAllMocks();
    review.value = snapshot({
      items: [item({ reasonCode: 'active_tag', reasonTag: { id: 'tag-1', name: '产品' } })],
    });
    const tagHost = mountCard();
    tagHost.querySelector<HTMLButtonElement>('.daily-review__tag-space')?.click();
    await settle();
    expect(actOnItem).toHaveBeenCalledWith('daily-item-1', 'open_tag_space', { keepalive: true });
    expect(routerPush).toHaveBeenCalledWith('/tag/tag-1');

    unmountCard();
    review.value = snapshot({
      items: [item({ reasonCode: 'buried', reasonTag: { id: 'tag-1', name: '产品' } })],
    });
    const malformedHost = mountCard();
    expect(malformedHost.querySelector('.daily-review__tag-space')).toBeNull();
  });

  it('书签只在 URL 校验通过的 beforeNavigate 中写入，非法 URL 不算已看', async () => {
    review.value = snapshot({
      items: [item({ resourceType: 'bookmark', resourceId: 'bookmark-1', url: 'https://example.com' })],
    });
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__open')?.click();
    expect(openBookmarkUrl).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ beforeNavigate: expect.any(Function) }),
    );
    expect(actOnItem).toHaveBeenCalledWith('daily-item-1', 'open', { keepalive: true });
    await settle();

    unmountCard();
    vi.clearAllMocks();
    review.value = snapshot({
      items: [item({ resourceType: 'bookmark', resourceId: 'bookmark-1', url: 'javascript:alert(1)' })],
    });
    const invalidHost = mountCard();
    invalidHost.querySelector<HTMLButtonElement>('.daily-review__open')?.click();
    await settle();
    expect(openBookmarkUrl).toHaveBeenCalled();
    expect(actOnItem).not.toHaveBeenCalled();
    expect(recordOperation).not.toHaveBeenCalled();
  });

  it('打开写入失败不阻断导航，保留当前条和轻量重试入口', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    review.value = snapshot();
    actOnItem.mockImplementationOnce(async () => {
      actionError.value = true;
      throw new Error('offline');
    });
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__open')?.click();
    expect(routerPush).toHaveBeenCalled();
    await settle();

    expect(host.textContent).toContain('第一条笔记');
    expect(host.textContent).toContain(zhCN.growth.dailyReviewSyncFailedTitle);
    host.querySelector<HTMLButtonElement>('.is-action-error button')?.click();
    await settle();
    expect(retryFailedAction).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('最后一条打开后保留无奖励压力的紧凑完成态', async () => {
    review.value = snapshot();
    const completed = snapshot({
      session: { id: 'session-1', status: 'completed', itemCount: 1, completedAt: '2026-09-01 10:00:00' },
      progress: { done: 1, total: 1, pending: 0 },
      items: [item({ action: 'opened' })],
    });
    actOnItem.mockImplementationOnce(async () => {
      review.value = completed;
      return mutationResponse(completed);
    });
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__open')?.click();
    await settle();

    expect(host.textContent).toContain(zhCN.growth.dailyReviewCompletedTitle);
    expect(host.textContent).toContain(zhCN.growth.dailyReviewCompletedDesc);
    expect(host.querySelector('.daily-review--compact')).not.toBeNull();
    expect(host.querySelector('.daily-review__open')).toBeNull();
  });

  it('completed、skipped、empty 的旧快照刷新失败时共用明确的过期提示与重试', async () => {
    const cases: Array<{ review: DailyReviewSnapshot; expected: string }> = [
      {
        review: snapshot({
          session: { id: 'session-1', status: 'completed', itemCount: 1 },
          progress: { done: 1, total: 1, pending: 0 },
          items: [item({ action: 'opened' })],
        }),
        expected: zhCN.growth.dailyReviewCompletedTitle,
      },
      {
        review: snapshot({
          session: { id: 'session-1', status: 'skipped', itemCount: 1 },
        }),
        expected: zhCN.growth.dailyReviewSkippedTitle,
      },
      {
        review: snapshot({
          session: { id: 'session-1', status: 'empty', itemCount: 0 },
          progress: { done: 0, total: 0, pending: 0 },
          items: [],
        }),
        expected: zhCN.growth.dailyReviewEmptyTitle,
      },
    ];
    loadDailyReview.mockImplementation(async () => {
      error.value = true;
      return null;
    });

    for (const testCase of cases) {
      error.value = false;
      review.value = testCase.review;
      const host = mountCard();
      await settle();

      expect(host.textContent).toContain(testCase.expected);
      expect(host.textContent).toContain(zhCN.growth.dailyReviewStale);
      expect(host.querySelectorAll('.daily-review__notice.is-stale')).toHaveLength(1);
      host.querySelector<HTMLButtonElement>('.daily-review__notice.is-stale button')?.click();
      await settle();
      expect(loadDailyReview).toHaveBeenLastCalledWith({ force: true, ensure: true });

      unmountCard();
      loadDailyReview.mockClear();
    }
  });

  it('刷新错误与动作错误各只渲染一份共享提示', () => {
    review.value = snapshot();
    error.value = true;
    actionError.value = true;
    const host = mountCard();

    expect(host.querySelectorAll('.daily-review__notice.is-stale')).toHaveLength(1);
    expect(host.querySelectorAll('.daily-review__notice.is-action-error')).toHaveLength(1);
  });

  it('今天先收起显示可恢复的紧凑条，不改成资源偏好动作', async () => {
    review.value = snapshot();
    actOnToday.mockImplementation(async (action: 'skip_today' | 'resume_today') => {
      const next = snapshot({
        session: { id: 'session-1', status: action === 'skip_today' ? 'skipped' : 'active', itemCount: 1 },
      });
      review.value = next;
      return mutationResponse(next);
    });
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__skip')?.click();
    await settle();

    expect(actOnToday).toHaveBeenCalledWith('skip_today');
    expect(host.textContent).toContain(zhCN.growth.dailyReviewSkippedTitle);
    expect(host.textContent).toContain(zhCN.growth.dailyReviewResumeToday);
    expect(actOnItem).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('.daily-review__resume')?.click();
    await settle();
    expect(actOnToday).toHaveBeenLastCalledWith('resume_today');
    expect(host.textContent).toContain('第一条笔记');
  });

  it('7 天后再看位于次级菜单，永久操作必须经过危险确认', async () => {
    review.value = snapshot();
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__more')?.click();
    await settle();

    let menuItems = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(menuItems.map((button) => button.textContent?.trim())).toEqual([
      zhCN.growth.recapSnooze,
      zhCN.growth.dailyReviewDismissItem,
    ]);
    menuItems[0]?.click();
    await settle();
    expect(actOnItem).toHaveBeenCalledWith('daily-item-1', 'snooze_7d', { keepalive: false });

    host.querySelector<HTMLButtonElement>('.daily-review__more')?.click();
    await settle();
    menuItems = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    menuItems.find((button) => button.textContent?.trim() === zhCN.growth.dailyReviewDismissItem)?.click();
    expect(alert).toHaveBeenCalledTimes(1);
    const confirmation = alert.mock.calls[0]?.[0];
    expect(confirmation).toMatchObject({
      title: zhCN.growth.dailyReviewDismissConfirmTitle,
      okType: 'danger',
      cancelText: zhCN.common.cancel,
    });
    confirmation.onOk();
    await settle();
    expect(actOnItem).toHaveBeenLastCalledWith('daily-item-1', 'dismiss', { keepalive: false });
  });

  it('永久确认框打开后当前项变化，确认仍只提交打开弹窗时捕获的条目', async () => {
    review.value = snapshot({
      session: { id: 'session-1', status: 'active', itemCount: 2 },
      progress: { done: 0, total: 2, pending: 2 },
      items: [item(), item({ id: 'daily-item-2', slot: 2, resourceId: 'note-2', title: '第二条笔记' })],
    });
    const host = mountCard();
    host.querySelector<HTMLButtonElement>('.daily-review__more')?.click();
    await settle();
    const dismissButton = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent?.trim() === zhCN.growth.dailyReviewDismissItem,
    );
    dismissButton?.click();
    const confirmation = alert.mock.calls[0]?.[0];

    review.value = snapshot({
      items: [item({ id: 'daily-item-2', resourceId: 'note-2', title: '刷新后的当前条目' })],
    });
    await nextTick();
    confirmation.onOk();
    await settle();

    expect(actOnItem).toHaveBeenCalledWith('daily-item-1', 'dismiss', { keepalive: false });
    expect(actOnItem).not.toHaveBeenCalledWith('daily-item-2', 'dismiss', expect.anything());
  });

  it('活动标签缺少标签信息或资源时间为空时安全降级', () => {
    review.value = snapshot({
      items: [item({ reasonCode: 'active_tag', reasonTag: null, time: null, resourceDate: null })],
    });
    const host = mountCard();
    expect(host.textContent).toContain(zhCN.growth.dailyReviewReasonFallback);
    expect(host.querySelector('.daily-review__item-meta time')).toBeNull();
    expect(host.querySelector('.daily-review__tag-space')).toBeNull();
  });
});

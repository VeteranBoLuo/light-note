import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';

const requestMocks = vi.hoisted(() => ({ apiBasePost: vi.fn(), getOrganizeArchiveDraft: vi.fn() }));
const messageMocks = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn() }));
const openOriginal = vi.hoisted(() => vi.fn());
const userState = reactive<{ id: string; role: string; adminContext: { subjectUserId: string; mode: string } | null }>({
  id: 'user-1',
  role: 'user',
  adminContext: null,
});
vi.mock('@/utils/openBookmark', () => ({ openBookmarkUrl: openOriginal }));

vi.mock('@/http/request.ts', () => requestMocks);
vi.mock('@/api/organizeSuggestionApi', () => ({ getOrganizeArchiveDraft: requestMocks.getOrganizeArchiveDraft }));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, te: (key: string) => !key.endsWith('.UNKNOWN') }),
}));
vi.mock('@/store', () => ({
  useUserStore: () => userState,
}));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: messageMocks,
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: { visible: Boolean },
    template: '<div v-if="visible" class="modal-stub"><slot /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: { disabled: Boolean, loading: Boolean },
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
}));
vi.mock('@/components/base/BasicComponents/BSpace.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

const { default: BookmarkSnapshotModal } = await import('./BookmarkSnapshotModal.vue');

let cleanup: (() => void) | undefined;
let controls: {
  visible: ReturnType<typeof ref<boolean>>;
  bookmarkId: ReturnType<typeof ref<string>>;
  draftContext: ReturnType<typeof ref<any>>;
};

function mountModal(bookmarkId = 'bookmark-1', draftContext?: { runId: string; suggestionId: string }) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      controls = { visible: ref(true), bookmarkId: ref(bookmarkId), draftContext: ref(draftContext) };
      return () =>
        h(BookmarkSnapshotModal, {
          visible: controls.visible.value,
          bookmarkId: controls.bookmarkId.value,
          draftContext: controls.draftContext.value,
          'onUpdate:visible': (value: boolean) => (controls.visible.value = value),
        });
    },
  });
  app.config.globalProperties.$t = (key: string) => key;
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  Object.assign(userState, { id: 'user-1', role: 'user', adminContext: null });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup?.();
  cleanup = undefined;
  requestMocks.apiBasePost.mockReset();
  requestMocks.getOrganizeArchiveDraft.mockReset();
  openOriginal.mockReset();
  Object.values(messageMocks).forEach((mock) => mock.mockReset());
});

describe('BookmarkSnapshotModal 网页存档生命周期', () => {
  it('打开缺少存档的弹窗不会自动调用 AI，用户可显式保存网页正文', async () => {
    let snapshotReads = 0;
    requestMocks.apiBasePost.mockImplementation(async (path: string) => {
      if (path === '/api/bookmark/snapshot') {
        snapshotReads += 1;
        return snapshotReads === 1
          ? { status: 200, data: null }
          : {
              status: 200,
              data: { title: '示例网页', content: '完整正文', summary: null, update_time: '2026-08-24' },
            };
      }
      if (path === '/api/bookmark/archive') return { status: 200, data: { ok: true } };
      throw new Error(`unexpected path: ${path}`);
    });

    const host = mountModal();

    await vi.waitFor(() => expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1));
    expect(requestMocks.apiBasePost).toHaveBeenCalledWith('/api/bookmark/snapshot', { id: 'bookmark-1' });
    expect(requestMocks.apiBasePost).not.toHaveBeenCalledWith('/api/bookmark/summarize', expect.anything());

    const archiveButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('bookmarkMg.snapshotCreateArchive'),
    );
    archiveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(host.textContent).toContain('完整正文'));
    expect(requestMocks.apiBasePost.mock.calls.map((call) => call[0])).toEqual([
      '/api/bookmark/snapshot',
      '/api/bookmark/archive',
      '/api/bookmark/snapshot',
    ]);
  });

  it('已有同版正文和摘要时只读取，不重复消耗 AI 额度', async () => {
    requestMocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { title: '示例网页', content: '完整正文', summary: '正文摘要', update_time: '2026-08-24' },
    });

    const host = mountModal();

    await vi.waitFor(() => expect(host.textContent).toContain('正文摘要'));
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);
    expect(requestMocks.apiBasePost).toHaveBeenCalledWith('/api/bookmark/snapshot', { id: 'bookmark-1' });
  });

  it('AI 摘要必须由用户显式触发，并明确调用计量接口', async () => {
    let snapshotReads = 0;
    requestMocks.apiBasePost.mockImplementation(async (path: string, body: any) => {
      if (path === '/api/bookmark/snapshot') {
        snapshotReads += 1;
        return {
          status: 200,
          data: {
            title: '示例网页',
            content: '完整正文',
            summary: snapshotReads > 1 ? '正文摘要' : null,
            update_time: '2026-08-24',
          },
        };
      }
      if (path === '/api/bookmark/summarize') {
        expect(body).toEqual({ id: 'bookmark-1', force: true });
        return { status: 200, data: { ok: true, summary: '正文摘要' } };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('完整正文'));
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);

    const summaryButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('bookmarkMg.aiSummaryGenerate'),
    );
    summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(host.textContent).toContain('正文摘要'));
    expect(requestMocks.apiBasePost.mock.calls.map((call) => call[0])).toEqual([
      '/api/bookmark/snapshot',
      '/api/bookmark/summarize',
      '/api/bookmark/snapshot',
    ]);
    expect(requestMocks.apiBasePost).toHaveBeenCalledWith(
      '/api/bookmark/summarize',
      { id: 'bookmark-1', force: true },
      { silent: true },
    );
  });

  it('AI 摘要单次预算不足时复用统一提示，并静默处理传输层 429', async () => {
    requestMocks.apiBasePost.mockImplementation(async (path: string) => {
      if (path === '/api/bookmark/snapshot') {
        return {
          status: 200,
          data: { title: '示例网页', content: '完整正文', summary: null, update_time: '2026-08-24' },
        };
      }
      if (path === '/api/bookmark/summarize') {
        return {
          status: 429,
          data: {
            ok: false,
            code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
            requiredTokens: 12_345,
            availableTokens: 8_765,
          },
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('完整正文'));

    const summaryButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('bookmarkMg.aiSummaryGenerate'),
    );
    summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(messageMocks.warning).toHaveBeenCalledWith('aiQuotaErrors.insufficientWithAmounts'));
    expect(requestMocks.apiBasePost).toHaveBeenCalledWith(
      '/api/bookmark/summarize',
      { id: 'bookmark-1', force: true },
      { silent: true },
    );
  });
  it('后台任务完成后刷新正文，轮询不重复触发存档或 AI', async () => {
    vi.useFakeTimers();
    let reads = 0;
    requestMocks.apiBasePost.mockImplementation(async () => ({
      status: 200,
      data:
        ++reads === 1
          ? { archiveTask: { status: 'running', attempts: 1 } }
          : { content: '后台读取正文', source: 'rendered_dom', archiveTask: { status: 'succeeded', attempts: 1 } },
    }));
    const host = mountModal();
    await vi.advanceTimersByTimeAsync(0);
    expect(host.textContent).toContain('bookmarkMg.archiveState_running');
    expect(host.textContent).toContain('organizeWorkspace.archiveWaitingPreview');
    expect(host.textContent).not.toContain('bookmarkMg.snapshotEmpty');
    expect([...host.querySelectorAll('button')].filter((b) => b.disabled)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2500);
    expect(host.textContent).toContain('后台读取正文');
    expect(host.textContent).toContain('bookmarkMg.archiveSourceRendered');
    await vi.advanceTimersByTimeAsync(5000);
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(2);
  });

  it('读取失败时显示原因并保留已有正文', async () => {
    requestMocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        content: '旧正文',
        archiveTask: { status: 'failed', attempts: 1, msg: '网站拒绝自动读取' },
        failedCount: 2,
      },
    });
    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('网站拒绝自动读取'));
    expect(host.textContent).toContain('旧正文');
    expect(host.textContent).toContain('bookmarkMg.archiveReread');
    expect(host.textContent).toContain('bookmarkMg.archivePreserved');
    expect(host.textContent).not.toContain('bookmarkMg.archiveFailedCount');
    expect(host.textContent).not.toContain('bookmarkMg.archiveRetryFailed');
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('bookmarkMg.archiveReread'));
    requestMocks.apiBasePost.mockResolvedValue({ status: 200, data: { ok: true } });
    retry?.click();
    await vi.waitFor(() =>
      expect(requestMocks.apiBasePost).toHaveBeenCalledWith(
        '/api/bookmark/archive',
        { id: 'bookmark-1' },
        { silent: true },
      ),
    );
    expect(requestMocks.apiBasePost).not.toHaveBeenCalledWith('/api/bookmark/archive/retry-failed', {});
  });

  it('已成功存档不展示其他书签的失败数量或批量重试入口', async () => {
    requestMocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { content: '已存档正文', failedCount: 3, archiveTask: { status: 'succeeded' } },
    });
    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('已存档正文'));
    expect(host.textContent).not.toContain('bookmarkMg.archiveFailedCount');
    expect(host.textContent).not.toContain('bookmarkMg.archiveRetryFailed');
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('卸载时停止轮询，不显示迟到的结果', async () => {
    vi.useFakeTimers();
    requestMocks.apiBasePost.mockResolvedValue({ status: 200, data: { archiveTask: { status: 'pending' } } });
    mountModal();
    await vi.advanceTimersByTimeAsync(0);
    cleanup?.();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(10000);
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);
  });

  const failedSnapshot = (reason = 'TIMEOUT', overrides = {}) => ({
    status: 200,
    data: {
      bookmarkUrl: 'https://example.com/current',
      archiveTask: { status: 'failed', reason_code: reason, retryable: reason === 'TIMEOUT', attempts: 3 },
      ...overrides,
    },
  });
  const button = (host: HTMLElement, key: string) => {
    const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(key));
    expect(found, key).toBeDefined();
    return found!;
  };
  const deferred = () => {
    let resolve!: (value: any) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<any>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    return { promise, resolve, reject };
  };

  it.each(['AUTH_REQUIRED', 'ACCESS_CHALLENGE', 'ACCESS_DENIED', 'NOT_HTML', 'EMPTY_CONTENT'])(
    '%s 没有存档也可打开当前原网页，不触发保存、重试或 AI',
    async (reason) => {
      requestMocks.apiBasePost.mockResolvedValue(failedSnapshot(reason));
      const host = mountModal();
      await vi.waitFor(() => expect(host.textContent).toContain(`bookmarkMg.archiveFailure.${reason}`));
      expect(host.textContent).toContain('bookmarkMg.archiveBookmarkSafe');
      expect(host.textContent).toContain('bookmarkMg.archiveReread');
      button(host, 'bookmarkMg.archiveOpenOriginal').click();
      expect(openOriginal).toHaveBeenCalledWith('https://example.com/current', { resourceId: 'bookmark-1' });
      expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);
    },
  );

  it.each([null, 'javascript:alert(1)'])(
    '缺少或无效的当前网址 %s 不使用旧快照网址作为继续入口',
    async (bookmarkUrl) => {
      requestMocks.apiBasePost.mockResolvedValue(
        failedSnapshot('INVALID_URL', { bookmarkUrl, url: 'https://example.com/old', content: '旧正文' }),
      );
      const host = mountModal();
      await vi.waitFor(() => expect(host.textContent).toContain('旧正文'));
      expect(host.textContent).not.toContain('bookmarkMg.archiveOpenOriginal');
      expect(openOriginal).not.toHaveBeenCalled();
    },
  );

  it('暂时故障支持重试，快速重复点击只提交一次并保留旧正文', async () => {
    const pending = deferred();
    const refresh = deferred();
    requestMocks.apiBasePost.mockResolvedValue(failedSnapshot('TIMEOUT', { content: '旧正文' }));
    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveRetryRead'));
    requestMocks.apiBasePost.mockImplementation(async (path) =>
      path.endsWith('/archive') ? pending.promise : refresh.promise,
    );
    const retry = button(host, 'bookmarkMg.archiveRetryRead');
    retry.click();
    retry.click();
    await nextTick();
    expect(requestMocks.apiBasePost.mock.calls.filter(([path]) => path.endsWith('/archive'))).toHaveLength(1);
    expect(retry.disabled).toBe(true);
    expect(host.textContent).toContain('旧正文');
    pending.resolve({ status: 200, data: { ok: true } });
    await vi.waitFor(() => expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(3));
    expect(host.querySelector('.bsnap-text')?.textContent).toBe('旧正文');
    refresh.resolve({ status: 200, data: { content: '旧正文', archiveTask: { status: 'pending' } } });
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveState_pending'));
    expect(host.textContent).toContain('旧正文');
  });

  it('提交断网后保留原内容和可重试入口，并持续显示提交状态不确定的提示', async () => {
    requestMocks.apiBasePost.mockResolvedValue(failedSnapshot());
    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveRetryRead'));
    requestMocks.apiBasePost.mockRejectedValueOnce(new Error('offline'));
    button(host, 'bookmarkMg.archiveRetryRead').click();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveSubmitFailed'));
    expect(button(host, 'bookmarkMg.archiveRetryRead').disabled).toBe(false);
    expect(button(host, 'bookmarkMg.archiveOpenOriginal').disabled).toBe(false);
    expect(messageMocks.info).not.toHaveBeenCalled();
    requestMocks.apiBasePost.mockResolvedValueOnce({ status: 200, data: { ok: false, reason: 'QUEUE_FULL' } });
    button(host, 'bookmarkMg.archiveRetryRead').click();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveFailure.QUEUE_FULL'));
  });

  it('已入队但状态读取失败时先重读状态，不误报提交失败或重复入队', async () => {
    requestMocks.apiBasePost.mockResolvedValue(failedSnapshot());
    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveRetryRead'));
    requestMocks.apiBasePost
      .mockResolvedValueOnce({ status: 200, data: { ok: true } })
      .mockRejectedValueOnce(new Error('offline'));
    button(host, 'bookmarkMg.archiveRetryRead').click();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveLoadError'));
    expect(host.textContent).not.toContain('bookmarkMg.archiveSubmitFailed');
    expect(button(host, 'bookmarkMg.archiveRetryRead').disabled).toBe(true);
    requestMocks.apiBasePost.mockResolvedValueOnce({ status: 200, data: { archiveTask: { status: 'pending' } } });
    button(host, 'common.retry').click();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveState_pending'));
    expect(requestMocks.apiBasePost.mock.calls.filter(([path]) => path.endsWith('/archive'))).toHaveLength(1);
  });

  it('首次状态读取失败只能刷新状态，不触发存档或 AI', async () => {
    requestMocks.apiBasePost.mockRejectedValueOnce(new Error('offline'));
    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveLoadError'));
    expect(button(host, 'bookmarkMg.snapshotCreateArchive').disabled).toBe(true);
    requestMocks.apiBasePost.mockResolvedValueOnce(failedSnapshot());
    button(host, 'common.retry').click();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveRetryRead'));
    expect(requestMocks.apiBasePost.mock.calls.every(([path]) => path === '/api/bookmark/snapshot')).toBe(true);
  });

  it.each(['bookmark', 'account', 'admin', 'close'])(
    '切换 %s 后丢弃迟到的读取响应，不恢复旧正文或原网页入口',
    async (change) => {
      const pending = deferred();
      requestMocks.apiBasePost
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue({ status: 200, data: { content: '新上下文正文' } });
      const host = mountModal();
      if (change === 'bookmark') controls.bookmarkId.value = 'bookmark-2';
      if (change === 'account') userState.id = 'user-2';
      if (change === 'admin') userState.adminContext = { subjectUserId: 'user-2', mode: 'readonly' };
      if (change === 'close') controls.visible.value = false;
      await nextTick();
      pending.resolve(failedSnapshot('TIMEOUT', { content: '不可恢复的旧正文' }));
      await nextTick();
      await nextTick();
      expect(host.textContent).not.toContain('不可恢复的旧正文');
      expect(host.textContent).not.toContain('bookmarkMg.archiveOpenOriginal');
    },
  );

  it('重试期间切换账号后迟到的提交失败不污染新账号状态', async () => {
    const pending = deferred();
    requestMocks.apiBasePost.mockResolvedValue(failedSnapshot());
    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveRetryRead'));
    requestMocks.apiBasePost
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ status: 200, data: { content: '新账号正文' } });
    button(host, 'bookmarkMg.archiveRetryRead').click();
    userState.id = 'user-2';
    await vi.waitFor(() => expect(host.textContent).toContain('新账号正文'));
    pending.reject(new Error('offline'));
    await nextTick();
    await nextTick();
    expect(host.textContent).not.toContain('bookmarkMg.archiveSubmitFailed');
    expect(messageMocks.info).not.toHaveBeenCalled();
  });

  it.each(['visitor', 'readonly'])('%s 可继续阅读但不能重试写入', async (role) => {
    if (role === 'visitor') userState.role = 'visitor';
    else userState.adminContext = { subjectUserId: 'user-2', mode: 'readonly' };
    requestMocks.apiBasePost.mockResolvedValue(failedSnapshot());
    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveOpenOriginal'));
    expect(host.textContent).not.toContain('bookmarkMg.archiveRetryRead');
    expect(host.textContent).not.toContain('bookmarkMg.archiveReread');
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('整理草稿继续保持只读，不提供正文重试或原书签入口', async () => {
    requestMocks.getOrganizeArchiveDraft.mockResolvedValue(failedSnapshot());
    const host = mountModal('bookmark-1', { runId: 'run-1', suggestionId: 'suggestion-1' });
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.archiveState_failed'));
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(requestMocks.apiBasePost).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

// mock composable 的外部依赖(HTTP / 提示 / 埋点 / 弹窗)
const apiBasePost = vi.fn();
vi.mock('@/http/request', () => ({ apiBasePost: (...a: any[]) => apiBasePost(...a) }));
const preflightBookmarkUrl = vi.fn(async (url: string) => ({
  ok: true,
  url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
}));
vi.mock('@/composables/useBookmarkUrlResolution', () => ({
  preflightBookmarkUrl: (...args: any[]) => preflightBookmarkUrl(...args),
}));
const messageSuccess = vi.fn();
const messageWarning = vi.fn();
const messageError = vi.fn();
const messageInfo = vi.fn();
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: {
    success: (...args: any[]) => messageSuccess(...args),
    warning: (...args: any[]) => messageWarning(...args),
    error: (...args: any[]) => messageError(...args),
    info: (...args: any[]) => messageInfo(...args),
  },
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
const alertAlert = vi.fn();
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: (...a: any[]) => alertAlert(...a), destroy: vi.fn() },
}));
const requestBookmarkMetaOverwriteDecision = vi.fn();
vi.mock('@/utils/bookmarkMetaOverwriteDecision', () => ({
  requestBookmarkMetaOverwriteDecision: (...args: any[]) => requestBookmarkMetaOverwriteDecision(...args),
}));

const { BOOKMARK_META_GENERATION_TIMEOUT_MS, useBookmarkMeta } = await import('@/composables/useBookmarkMeta');

function setup(tagOpts: any[] = []) {
  const bookmarkData = ref<any>({ url: 'https://x.com', name: '', description: '', relatedTags: [] });
  const tagOptions = ref<any[]>(tagOpts);
  const refreshTags = vi.fn().mockResolvedValue(tagOptions.value);
  const api = useBookmarkMeta({ bookmarkData, tagOptions, refreshTags });
  return { bookmarkData, tagOptions, refreshTags, ...api };
}

describe('useBookmarkMeta.generateBookmarkMeta', () => {
  beforeEach(() => {
    apiBasePost.mockReset();
    preflightBookmarkUrl.mockClear();
    alertAlert.mockReset();
    requestBookmarkMetaOverwriteDecision.mockReset();
    messageSuccess.mockReset();
    messageWarning.mockReset();
    messageError.mockReset();
    messageInfo.mockReset();
  });

  it('回填 name/description,只勾选候选内存在的推荐标签(白名单过滤)', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { name: 'N', description: 'D', matchedTagIds: ['t1', 'ghost'], newTags: [] },
    });
    const t = setup([{ label: 'T1', value: 't1' }]);
    await t.generateBookmarkMeta();
    expect(t.bookmarkData.value.name).toBe('N');
    expect(t.bookmarkData.value.description).toBe('D');
    expect(t.bookmarkData.value.relatedTags).toEqual(['t1']); // ghost 不在候选,被过滤
    expect(alertAlert).not.toHaveBeenCalled();
  });

  it('已有内容不被 AI 静默覆盖,用户可选择保留当前内容', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { name: 'AI 名称', description: 'AI 描述', matchedTagIds: [], newTags: [] },
    });
    const t = setup([]);
    t.bookmarkData.value.name = '当前名称';
    t.bookmarkData.value.description = '当前描述';

    requestBookmarkMetaOverwriteDecision.mockResolvedValueOnce(null);
    await t.generateBookmarkMeta();

    expect(t.bookmarkData.value.name).toBe('当前名称');
    expect(t.bookmarkData.value.description).toBe('当前描述');
    expect(requestBookmarkMetaOverwriteDecision).toHaveBeenCalledWith(
      [
        { id: 'name', currentValue: '当前名称', generatedValue: 'AI 名称' },
        { id: 'description', currentValue: '当前描述', generatedValue: 'AI 描述' },
      ],
      { signal: expect.any(AbortSignal) },
    );
  });

  it('覆盖预览支持逐字段选择，只应用用户勾选的识别结果', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { name: 'AI 名称', description: 'AI 描述', matchedTagIds: [], newTags: [] },
    });
    const t = setup([]);
    t.bookmarkData.value.name = '当前名称';
    t.bookmarkData.value.description = '当前描述';

    requestBookmarkMetaOverwriteDecision.mockResolvedValueOnce(['name']);
    await t.generateBookmarkMeta();

    expect(t.bookmarkData.value.name).toBe('AI 名称');
    expect(t.bookmarkData.value.description).toBe('当前描述');
  });

  it('勾选标签遵守 ≤4 上限', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { name: '', description: '', matchedTagIds: ['a', 'b', 'c', 'd', 'e'], newTags: [] },
    });
    const t = setup(['a', 'b', 'c', 'd', 'e'].map((v) => ({ label: v, value: v })));
    await t.generateBookmarkMeta();
    expect(t.bookmarkData.value.relatedTags.length).toBe(4);
  });

  it('无匹配但有建议 → 弹确认新建,且只问第一个(单标签)', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { name: '', description: '', matchedTagIds: [], newTags: ['前端', '工具'] },
    });
    const t = setup([]);
    await t.generateBookmarkMeta();
    expect(alertAlert).toHaveBeenCalledTimes(1);
    const arg = alertAlert.mock.calls[0][0];
    expect(arg.content).toContain('前端');
    expect(arg.content).not.toContain('工具');
  });

  it('url 为空时不发请求', async () => {
    const t = setup([]);
    t.bookmarkData.value.url = '';
    await t.generateBookmarkMeta();
    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it('url 未带协议头时自动补 https:// 再请求(允许用户只填 keep.com)', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { name: '', description: '', matchedTagIds: [], newTags: [] },
    });
    const t = setup([]);
    t.bookmarkData.value.url = 'keep.com';
    await t.generateBookmarkMeta();
    expect(t.bookmarkData.value.url).toBe('https://keep.com');
    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/chat/generateBookmarkMeta',
      { url: 'https://keep.com' },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        silent: true,
        timeout: BOOKMARK_META_GENERATION_TIMEOUT_MS + 5_000,
      }),
    );
  });

  it('网址检查与确认阶段不冒充 AI 生成中，并阻止重复发起检查', async () => {
    let finishPreflight: ((result: { ok: boolean; url?: string; cancelled?: boolean }) => void) | undefined;
    preflightBookmarkUrl.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPreflight = resolve;
        }),
    );
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { name: '', description: '', matchedTagIds: [], newTags: [] },
    });
    const t = setup([]);

    const pending = t.generateBookmarkMeta();
    await vi.waitFor(() => expect(preflightBookmarkUrl).toHaveBeenCalledTimes(1));
    expect(t.resolvingUrl.value).toBe(true);
    expect(t.generating.value).toBe(false);
    expect(apiBasePost).not.toHaveBeenCalled();

    await t.generateBookmarkMeta();
    expect(preflightBookmarkUrl).toHaveBeenCalledTimes(1);

    finishPreflight?.({ ok: true, url: 'https://x.com' });
    await vi.waitFor(() => expect(apiBasePost).toHaveBeenCalledTimes(1));
    await pending;

    expect(t.resolvingUrl.value).toBe(false);
    expect(t.generating.value).toBe(false);
  });

  it('网址检查被取消后立即恢复空闲状态且不调用 AI', async () => {
    preflightBookmarkUrl.mockResolvedValueOnce({ ok: false, cancelled: true });
    const t = setup([]);

    await t.generateBookmarkMeta();

    expect(t.resolvingUrl.value).toBe(false);
    expect(t.generating.value).toBe(false);
    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it('用户点击停止后会真正中止请求，不回填任何识别结果', async () => {
    let requestSignal: AbortSignal | undefined;
    apiBasePost.mockImplementation((_url, _data, options) => {
      requestSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject({ code: 'ERR_CANCELED' }), { once: true });
      });
    });
    const t = setup([]);

    const pending = t.generateBookmarkMeta();
    await vi.waitFor(() => expect(apiBasePost).toHaveBeenCalledTimes(1));
    expect(t.resolvingUrl.value).toBe(false);
    expect(t.generating.value).toBe(true);
    t.stopBookmarkMetaGeneration();
    await pending;

    expect(requestSignal?.aborted).toBe(true);
    expect(t.generating.value).toBe(false);
    expect(t.bookmarkData.value.name).toBe('');
    expect(messageInfo).toHaveBeenCalledTimes(1);
    expect(messageError).not.toHaveBeenCalled();
  });

  it('超过等待上限会自动中止并给出超时提示', async () => {
    vi.useFakeTimers();
    try {
      apiBasePost.mockImplementation((_url, _data, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject({ code: 'ERR_CANCELED' }), { once: true });
        }),
      );
      const t = setup([]);
      const pending = t.generateBookmarkMeta();
      await Promise.resolve();
      await Promise.resolve();
      expect(apiBasePost).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(BOOKMARK_META_GENERATION_TIMEOUT_MS);
      await pending;

      expect(t.generating.value).toBe(false);
      expect(messageError).toHaveBeenCalledTimes(1);
      expect(messageInfo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

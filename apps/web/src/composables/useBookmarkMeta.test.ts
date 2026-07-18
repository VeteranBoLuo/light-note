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
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
const alertAlert = vi.fn();
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: (...a: any[]) => alertAlert(...a), destroy: vi.fn() },
}));

const { useBookmarkMeta } = await import('@/composables/useBookmarkMeta');

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

    const generating = t.generateBookmarkMeta();
    await vi.waitFor(() => expect(alertAlert).toHaveBeenCalledTimes(1));
    alertAlert.mock.calls[0][0].footer[0].function();
    await generating;

    expect(t.bookmarkData.value.name).toBe('当前名称');
    expect(t.bookmarkData.value.description).toBe('当前描述');
  });

  it('用户确认后应用 AI 识别结果', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { name: 'AI 名称', description: 'AI 描述', matchedTagIds: [], newTags: [] },
    });
    const t = setup([]);
    t.bookmarkData.value.name = '当前名称';
    t.bookmarkData.value.description = '当前描述';

    const generating = t.generateBookmarkMeta();
    await vi.waitFor(() => expect(alertAlert).toHaveBeenCalledTimes(1));
    alertAlert.mock.calls[0][0].footer[1].function();
    await generating;

    expect(t.bookmarkData.value.name).toBe('AI 名称');
    expect(t.bookmarkData.value.description).toBe('AI 描述');
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
    expect(apiBasePost).toHaveBeenCalledWith('/api/chat/generateBookmarkMeta', { url: 'https://keep.com' });
  });
});

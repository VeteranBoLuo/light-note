import { createApp, h, ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useOrganizeBatchApply, canBatchApply } from './useOrganizeBatchApply';
import type { WorkspaceItem } from '@/api/organizeSuggestionApi';
const api = vi.hoisted(() => ({ applyRunSuggestionBatch: vi.fn() }));
vi.mock('@/api/organizeSuggestionApi', () => api);
vi.mock('@/utils/common', () => ({ generateUUID: () => crypto.randomUUID() }));
let cleanup: () => void;
afterEach(() => {
  cleanup?.();
  vi.resetAllMocks();
});
function mount(count = 25) {
  const rows = ref(
    Array.from({ length: count }, (_, n) => ({
      aiStatus: 'completed',
      suggestions: [{ id: String(n), kind: 'archive', status: 'pending', archivePreview: { status: 'ready' } }],
    })) as WorkspaceItem[],
  );
  const scope = ref('user:run'),
    allowed = ref(true),
    changed = vi.fn();
  let review!: ReturnType<typeof useOrganizeBatchApply>;
  const app = createApp({
    setup() {
      review = useOrganizeBatchApply(scope, ref('run'), rows, allowed, changed);
      return () => h('div');
    },
  });
  const host = document.createElement('div');
  app.mount(host);
  cleanup = () => app.unmount();
  return { review, scope, rows, changed };
}
it('20 项分批，取消项不提交，失败保留且重试沿用标识', async () => {
  const { review } = mount();
  api.applyRunSuggestionBatch.mockImplementation(async (_, items) => ({
    status: 200,
    data: {
      results: items.map((i: any) => ({
        ...i,
        status: i.suggestionId === '1' ? 'failed' : 'applied',
        message: '版本变化',
      })),
    },
  }));
  review.start();
  review.selected.delete('0');
  await review.apply();
  expect(api.applyRunSuggestionBatch.mock.calls.map((c) => c[1].length)).toEqual([20, 4]);
  expect(review.outcome.value).toEqual({ success: 23, failed: 1 });
  expect(review.errors.get('1')).toBe('版本变化');
  expect(review.selectedCount.value).toBe(1);
  const key = api.applyRunSuggestionBatch.mock.calls[0][1][0].requestId;
  await review.apply();
  expect(api.applyRunSuggestionBatch.mock.calls[2][1][0].requestId).toBe(key);
});
it('切换身份后丢弃迟到结果，不提交下一批', async () => {
  const { review, scope, changed } = mount();
  let resolve!: (value: any) => void;
  api.applyRunSuggestionBatch.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  review.start();
  const pending = review.apply();
  scope.value = 'other';
  resolve({ status: 200, data: { results: [] } });
  await pending;
  expect(api.applyRunSuggestionBatch).toHaveBeenCalledTimes(1);
  expect(changed).not.toHaveBeenCalled();
  expect(review.selected.size).toBe(0);
});
it('网络失败停止后续批次；不批量清理、合并、手动项或缺失存档', async () => {
  const { review } = mount();
  api.applyRunSuggestionBatch.mockRejectedValue(new Error('网络失败'));
  review.start();
  await review.apply();
  expect(api.applyRunSuggestionBatch).toHaveBeenCalledTimes(1);
  for (const suggestion of [
    { kind: 'empty', status: 'pending' },
    { kind: 'duplicate', status: 'pending' },
    { kind: 'tags', status: 'insufficient', after: [] },
    { kind: 'archive', status: 'pending' },
  ])
    expect(canBatchApply(suggestion as any)).toBe(false);
});

it('批量中失效项退出选择，其他项继续成功', async () => {
  const { review } = mount();
  api.applyRunSuggestionBatch.mockImplementation(async (_, items) => ({ status: 200, data: { results: items.map(i => ({ ...i, status: i.suggestionId === '1' ? 'expired' : 'applied', message: '资料已移入回收站' })) } }));
  review.start();
  await review.apply();
  expect(review.outcome.value).toEqual({ success: 24, failed: 1 });
  expect(review.selectedCount.value).toBe(0);
});

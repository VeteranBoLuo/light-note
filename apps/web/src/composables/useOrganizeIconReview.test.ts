import { beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { useOrganizeIconReview } from './useOrganizeIconReview';
import type { SuggestionRun, WorkspaceItem } from '@/api/organizeSuggestionApi';
const api = vi.hoisted(() => ({ actOnRunSuggestion: vi.fn() }));
vi.mock('@/api/organizeSuggestionApi', () => api);
vi.mock('@/utils/common', () => ({ generateUUID: () => crypto.randomUUID() }));
beforeEach(() => vi.clearAllMocks());
function mountReview() {
  const run = ref({ id: 'run' } as SuggestionRun);
  const items = ref(
    Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      suggestions: [
        {
          id: String(index),
          kind: 'tag_icon',
          status: 'pending',
          after: { iconName: 'lucide:book', color: 'currentColor', iconUrl: 'safe' },
        },
      ],
    })) as WorkspaceItem[],
  );
  let review!: ReturnType<typeof useOrganizeIconReview>;
  const changed = vi.fn();
  const host = document.createElement('div');
  const app = createApp({
    setup() {
      review = useOrganizeIconReview(run, items, changed);
      return () => h('div');
    },
  });
  app.mount(host);
  return { review, items, run, changed, close: () => app.unmount() };
}
it('默认不勾选；批量限并发、保留失败选择并只重试失败', async () => {
  const { review, changed, close } = mountReview();
  let active = 0,
    peak = 0;
  api.actOnRunSuggestion.mockImplementation(async (_run, id) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return id === '2' ? { status: 409, msg: '标签已变化' } : { status: 200, data: { status: 'applied' } };
  });
  expect(review.selectedCount.value).toBe(0);
  review.startBatch();
  review.selectAvailable();
  await review.applySelected();
  expect(peak).toBeLessThanOrEqual(3);
  expect(review.outcome.value).toEqual({ success: 4, failed: 1 });
  expect([...review.selected]).toEqual(['2']);
  expect(changed).toHaveBeenCalledTimes(1);
  api.actOnRunSuggestion.mockClear();
  await review.applySelected();
  expect(api.actOnRunSuggestion).toHaveBeenCalledTimes(1);
  expect(api.actOnRunSuggestion.mock.calls[0][1]).toBe('2');
  close();
});
it('离开页面停止继续发送剩余批次', async () => {
  const { review, close } = mountReview();
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  api.actOnRunSuggestion.mockReturnValue(pending);
  review.startBatch();
  review.selectAvailable();
  const running = review.applySelected();
  expect(api.actOnRunSuggestion).toHaveBeenCalledTimes(3);
  close();
  resolve({ status: 200, data: { status: 'applied' } });
  await running;
  expect(api.actOnRunSuggestion).toHaveBeenCalledTimes(3);
});

it('批量模式需显式进入，退出清空选择但保留图标草稿，换任务重置', async () => {
  const { review, run, close } = mountReview();
  expect(review.selecting.value).toBe(false);
  review.selectAvailable();
  expect(review.selectedCount.value).toBe(0);
  review.startBatch();
  expect(review.selecting.value).toBe(true);
  expect(review.selectedCount.value).toBe(0);
  review.drafts.set('0', { iconName: 'lucide:star', color: 'currentColor', iconUrl: 'safe' });
  review.selectAvailable();
  review.exitBatch();
  expect(review.selecting.value).toBe(false);
  expect(review.selectedCount.value).toBe(0);
  expect(review.drafts.has('0')).toBe(true);
  review.startBatch();
  review.selectAvailable();
  run.value = { id: 'next' } as SuggestionRun;
  await nextTick();
  expect(review.selecting.value).toBe(false);
  expect(review.selected.size).toBe(0);
  expect(review.drafts.size).toBe(0);
  close();
});
it('只有手动补充时不能进入，选好图标后可以进入；提交中不能退出或改选', async () => {
  const { review, items, close } = mountReview();
  for (const item of items.value) {
    item.suggestions[0].status = 'no_suggestion';
    item.suggestions[0].after = null;
  }
  review.startBatch();
  expect(review.selecting.value).toBe(false);
  review.drafts.set('0', { iconName: 'lucide:star', color: 'currentColor', iconUrl: 'safe' });
  review.startBatch();
  review.selectAvailable();
  let resolve!: (value: unknown) => void;
  api.actOnRunSuggestion.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = review.applySelected();
  review.exitBatch();
  review.selectAll(false);
  expect(review.selecting.value).toBe(true);
  expect(review.selectedCount.value).toBe(1);
  resolve({ status: 200, data: { status: 'applied' } });
  await pending;
  expect(review.selectedCount.value).toBe(0);
  expect(review.selecting.value).toBe(true);
  review.exitBatch();
  expect(review.selecting.value).toBe(false);
  close();
});

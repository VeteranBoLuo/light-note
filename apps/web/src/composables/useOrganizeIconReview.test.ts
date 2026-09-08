import { beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, ref } from 'vue';
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
  review.selectAvailable();
  const running = review.applySelected();
  expect(api.actOnRunSuggestion).toHaveBeenCalledTimes(3);
  close();
  resolve({ status: 200, data: { status: 'applied' } });
  await running;
  expect(api.actOnRunSuggestion).toHaveBeenCalledTimes(3);
});

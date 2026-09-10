import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { apiBasePost } from '@/http/request';
import { normalizeNoteTags, useNoteTags } from './useNoteTags';
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.resetAllMocks();
});
it('normalizes legacy JSON and ignores empty records', () => {
  expect(normalizeNoteTags('[null,{"id":"a","name":"项目"},{"name":""}]')).toEqual([{ id: 'a', name: '项目' }]);
  expect(normalizeNoteTags('invalid')).toEqual([]);
});
describe('note tag snapshots', () => {
  it('ignores a previous note response and treats an empty response as authoritative', async () => {
    const pending: ((value: any) => void)[] = [];
    vi.mocked(apiBasePost).mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const id = ref('first');
    let state!: ReturnType<typeof useNoteTags>;
    const host = document.createElement('div');
    const app = createApp({
      setup() {
        state = useNoteTags(
          () => id.value,
          () => [{ name: id.value }],
        );
        return () => null;
      },
    });
    app.mount(host);
    cleanup = () => app.unmount();
    id.value = 'second';
    await nextTick();
    pending[1]({ status: 200, data: [] });
    await nextTick();
    pending[0]({ status: 200, data: [{ name: 'stale' }] });
    await nextTick();
    expect(state.tags.value).toEqual([]);
    const refresh = state.refresh();
    pending[2]({ status: 200, data: [{ id: 'new', name: '新标签' }] });
    await refresh;
    expect(state.tags.value).toEqual([{ id: 'new', name: '新标签' }]);
  });
});

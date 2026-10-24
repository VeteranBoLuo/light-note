import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, ref } from 'vue';
import type { PublicationWorkspaceItem } from '@lightnote/shared/public-resources';
const mocks = vi.hoisted(() => ({ scope: {} as any, preview: vi.fn() }));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/api/publicResources', () => ({ previewPublication: (...args: any[]) => mocks.preview(...args) }));
import { usePublicationPreview } from './usePublicationPreview';
const source = (id: string): PublicationWorkspaceItem => ({
  kind: 'note',
  sourceId: id,
  title: id,
  updatedAt: id,
  publication: null,
  sourceUnavailable: false,
});
let app: ReturnType<typeof createApp>;
const item = ref<PublicationWorkspaceItem | null>(null);
function mount() {
  let state!: ReturnType<typeof usePublicationPreview>;
  app = createApp({
    setup() {
      state = usePublicationPreview(item);
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  return state;
}
const flush = async () => {
  await Promise.resolve();
  await nextTick();
};
beforeEach(() => {
  vi.clearAllMocks();
  item.value = null;
  mocks.scope = reactive({ identity: 'one', eligible: true, caps: { submissionsEnabled: true } });
});
afterEach(() => app?.unmount());
describe('independent original preview', () => {
  it('only reads the focused original; switches abort and ignore old successful or failed responses', async () => {
    const pending: { resolve: (value: any) => void; reject: (value: any) => void; signal: AbortSignal }[] = [];
    mocks.preview.mockImplementation(
      (_kind, _id, signal) => new Promise((resolve, reject) => pending.push({ resolve, reject, signal })),
    );
    const state = mount();
    expect(mocks.preview).not.toHaveBeenCalled();
    item.value = source('a');
    item.value = source('b');
    expect(pending[0].signal.aborted).toBe(true);
    pending[1].resolve({ title: 'b', body: 'current' });
    await flush();
    pending[0].resolve({ title: 'a', body: 'stale' });
    await flush();
    expect(state.material.value?.body).toBe('current');
    item.value = source('c');
    item.value = source('d');
    pending[2].reject({ code: 'PRIVATE_ERROR' });
    await flush();
    expect(state.error.value).toBe('');
    expect(state.loading.value).toBe(true);
    pending[3].resolve({ title: 'd' });
    await flush();
    expect(state.material.value?.title).toBe('d');
  });
  it('clears body on deselection, account change and unmount, even if cancellation is ignored', async () => {
    let resolve!: (value: any) => void;
    mocks.preview.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const state = mount();
    item.value = source('a');
    const old = resolve;
    mocks.scope.eligible = false;
    mocks.scope.identity = 'other';
    old({ body: 'private' });
    await flush();
    expect(state.material.value).toBeNull();
    expect(state.loading.value).toBe(false);
    mocks.scope.eligible = true;
    item.value = source('b');
    resolve({ body: 'b' });
    await flush();
    expect(state.material.value?.body).toBe('b');
    item.value = null;
    expect(state.material.value).toBeNull();
    item.value = source('c');
    const late = resolve;
    app.unmount();
    late({ body: 'c' });
    await flush();
    expect(state.material.value).toBeNull();
  });
  it('closed submissions and missing originals never read a body; failures retry only on request', async () => {
    mocks.preview.mockRejectedValue({ code: 'PUBLIC_RESOURCE_TEXT_ONLY' });
    const state = mount();
    mocks.scope.caps.submissionsEnabled = false;
    item.value = source('a');
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(state.error.value).toBe('PUBLIC_RESOURCE_READ_ONLY');
    mocks.scope.caps.submissionsEnabled = true;
    await flush();
    expect(state.error.value).toBe('PUBLIC_RESOURCE_TEXT_ONLY');
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    await state.retry();
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    item.value = { ...source('b'), sourceUnavailable: true };
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(state.error.value).toBe('PUBLIC_RESOURCE_SOURCE_UNAVAILABLE');
  });
});

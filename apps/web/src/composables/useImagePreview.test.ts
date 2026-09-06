import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, reactive, ref, nextTick, type EffectScope } from 'vue';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), user: { id: 'u', role: 'user', adminContext: null } }));
vi.mock('@/api/imagePreviewApi', () => ({ fetchImagePreviews: mocks.fetch, imagePreviewsEnabled: () => true }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
import { useImagePreview } from './useImagePreview';
let scope: EffectScope;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  scope = effectScope();
});
afterEach(() => {
  scope.stop();
  vi.useRealTimers();
});
describe('visible image batching', () => {
  it('batches visible subscriptions with a maximum of 40 and does not queue hidden images', async () => {
    mocks.fetch.mockImplementation(async (_source, ids) => ({
      enabled: true,
      items: ids.map((id) => ({ id, status: 'ready', previewUrl: '/derived' })),
    }));
    scope.run(() => {
      for (let i = 0; i < 45; i++)
        useImagePreview(
          () => 'cloud',
          () => String(i),
          () => true,
        );
      useImagePreview(
        () => 'cloud',
        () => 'hidden',
        () => false,
      );
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls.map((call) => call[1].length)).toEqual([40, 5]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it('stops polling when hidden or disposed and ignores responses to removed subscriptions', async () => {
    let resolve;
    mocks.fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const active = ref(true);
    const preview = scope.run(() =>
      useImagePreview(
        () => 'chat',
        () => 'p',
        () => active.value,
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    active.value = false;
    await nextTick();
    resolve({ enabled: true, items: [{ id: 'p', status: 'ready', previewUrl: '/old' }] });
    await Promise.resolve();
    await Promise.resolve();
    expect(preview.state.value).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds processing to 30 seconds and retries only on explicit request', async () => {
    mocks.fetch.mockResolvedValue({ enabled: true, items: [{ id: '1', status: 'processing' }] });
    const preview = scope.run(() =>
      useImagePreview(
        () => 'cloud',
        () => '1',
        () => true,
      ),
    );
    await vi.advanceTimersByTimeAsync(32000);
    expect(preview.state.value.status).toBe('failed');
    const calls = mocks.fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.fetch).toHaveBeenCalledTimes(calls);
    preview.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch.mock.calls.at(-1)[4]).toBe(true);
  });
});

it('pauses live polling while the page is hidden and resumes only when visible', async () => {
  mocks.fetch.mockResolvedValue({ enabled: true, items: [{ id: '1', status: 'processing' }] });
  scope.run(() =>
    useImagePreview(
      () => 'cloud',
      () => '1',
      () => true,
    ),
  );
  await vi.advanceTimersByTimeAsync(0);
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(8000);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it('refreshes a rejected signature at most once per visible subscription', async () => {
  mocks.fetch.mockResolvedValue({ enabled: true, items: [{ id: '1', status: 'ready', previewUrl: '/bad-signature' }] });
  const preview = scope.run(() =>
    useImagePreview(
      () => 'cloud',
      () => '1',
      () => true,
    ),
  );
  await vi.advanceTimersByTimeAsync(0);
  preview.refreshOnce();
  await vi.advanceTimersByTimeAsync(0);
  preview.refreshOnce();
  await vi.advanceTimersByTimeAsync(6000);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(preview.state.value.errorCode).toBe('IMAGE_PREVIEW_LOAD_FAILED');
});

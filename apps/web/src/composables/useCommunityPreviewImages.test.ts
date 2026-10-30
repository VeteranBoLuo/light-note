import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), user: null as any }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/http/request', () => ({ default: { get: mocks.get } }));
import { useCommunityPreviewImages } from './useCommunityPreviewImages';
beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});
afterAll(() => {
  delete (URL as any).createObjectURL;
  delete (URL as any).revokeObjectURL;
});
let cleanup = () => {};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.get.mockReset();
});
it('loads protected media via the authenticated client and discards old identity responses', async () => {
  mocks.user = reactive({ id: 'subject', role: 'user', adminContext: { id: 'first' } });
  const pending: ((result: any) => void)[] = [];
  mocks.get.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const source = '/api/community/images/photo';
  let images!: ReturnType<typeof useCommunityPreviewImages>;
  const app = createApp({
    setup() {
      images = useCommunityPreviewImages(() => [source]);
      return () => h('img', { src: images.imageSource(source) });
    },
  });
  const host = document.createElement('div');
  app.mount(host);
  cleanup = () => app.unmount();
  expect(host.querySelector('img')?.getAttribute('src')).toBeNull();
  expect(mocks.get).toHaveBeenCalledWith(
    source,
    expect.objectContaining({ responseType: 'blob', signal: expect.any(AbortSignal) }),
  );
  mocks.user.adminContext.id = 'second';
  pending[0]({ data: new Blob(['old'], { type: 'image/png' }) });
  await nextTick();
  expect(create).not.toHaveBeenCalled();
  pending[1]({ data: new Blob(['current'], { type: 'image/png' }) });
  await nextTick();
  await nextTick();
  expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:preview');
  mocks.user.adminContext.id = 'third';
  expect(images.imageSource(source)).toBeUndefined();
  expect(revoke).toHaveBeenCalledWith('blob:preview');
  expect(images.imageSource('https://example.com/api/community/images/photo')).toBeUndefined();
});
it('keeps normal image URLs unchanged outside administrator preview', () => {
  mocks.user = reactive({ id: 'member', role: 'user', adminContext: null });
  let src: string | undefined;
  const app = createApp({
    setup() {
      src = useCommunityPreviewImages(() => ['/api/community/images/photo']).imageSource('/api/community/images/photo');
      return () => h('div');
    },
  });
  app.mount(document.createElement('div'));
  cleanup = () => app.unmount();
  expect(src).toBe('/api/community/images/photo');
  expect(mocks.get).not.toHaveBeenCalled();
});

it('uses public avatar metadata without forwarding the preview request to an external host', async () => {
  mocks.user = reactive({ id: 'subject', role: 'user', adminContext: { id: 'context' } });
  mocks.get.mockResolvedValue({
    data: {
      type: 'application/json',
      text: async () => JSON.stringify({ publicAvatarUrl: 'https://example.com/avatar.png' }),
    },
  });
  let images!: ReturnType<typeof useCommunityPreviewImages>;
  const source = '/api/community/posts/post/avatar';
  const app = createApp({
    setup() {
      images = useCommunityPreviewImages(() => [source]);
      return () => h('div');
    },
  });
  app.mount(document.createElement('div'));
  cleanup = () => app.unmount();
  await nextTick();
  await nextTick();
  await nextTick();
  expect(images.imageSource(source)).toBe('https://example.com/avatar.png');
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.get.mock.calls[0][0]).toBe(source);
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import Motion from './AvatarFramePublicContributionMotion.vue';

const mocks = vi.hoisted(() => ({ paint: vi.fn(), active: new Set<(dt: number) => void>() }));
vi.mock('./publicContributionMotion', () => ({ paintPublicContributionFrame: mocks.paint }));
vi.mock('./publicContributionClock', () => ({
  subscribeContributionMotion: (callback: (dt: number) => void) => {
    mocks.active.add(callback);
    return () => mocks.active.delete(callback);
  },
}));
let disconnect: ReturnType<typeof vi.fn>;
let intersect: (entries: { isIntersecting: boolean }[]) => void;
let media: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
let app: ReturnType<typeof createApp>;
let host: HTMLElement;
beforeEach(() => {
  mocks.paint.mockClear();
  mocks.active.clear();
  disconnect = vi.fn();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    },
  );
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(paused = false) {
  const props = reactive({ kind: 'legendary' as const, paused, chat: false });
  app = createApp({ render: () => h(Motion, props) });
  app.mount(host);
  intersect([{ isIntersecting: true }]);
  await nextTick();
  return props;
}
describe('public contribution frame motion lifecycle', () => {
  it('renders a complete still composition when disabled, resumes without resetting, and releases the shared clock', async () => {
    const props = await mount(true);
    expect(mocks.paint).toHaveBeenCalled();
    expect(mocks.active.size).toBe(0);
    props.paused = false;
    await nextTick();
    mocks.active.forEach((callback) => callback(0.2));
    props.paused = true;
    await nextTick();
    expect(mocks.paint.mock.lastCall?.slice(-2)).toEqual([0.2, 0.2]);
    expect(mocks.active.size).toBe(0);
    props.paused = false;
    await nextTick();
    mocks.active.forEach((callback) => callback(0.2));
    expect(mocks.paint.mock.lastCall?.slice(-2)).toEqual([0.4, 0.4]);
    app.unmount();
    expect(mocks.active.size).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });
  it('stops offscreen and renders reduced-motion leaves and beams without scheduling animation', async () => {
    await mount();
    expect(mocks.active.size).toBe(1);
    intersect([{ isIntersecting: false }]);
    await nextTick();
    expect(mocks.active.size).toBe(0);
    intersect([{ isIntersecting: true }]);
    await nextTick();
    media.matches = true;
    media.addEventListener.mock.calls[0][1]();
    await nextTick();
    expect(host.querySelector('canvas')?.getAttribute('data-motion-state')).toBe('reduced');
    expect(mocks.paint.mock.lastCall?.slice(-2)).toEqual([0, 0]);
    expect(mocks.active.size).toBe(0);
  });
});

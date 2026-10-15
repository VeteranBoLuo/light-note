import { createApp, h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fountain from './ProfileBackgroundFountain.vue';

let sequence = 0;
const frames = new Map<number, FrameRequestCallback>();
let cleanup: (() => void) | undefined;
const context = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  drawImage: vi.fn(),
  ellipse: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  fillRect: vi.fn(),
  rect: vi.fn(),
  quadraticCurveTo: vi.fn(),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  frames.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function image() {
  const result = new Image();
  Object.defineProperties(result, { naturalWidth: { value: 1920 }, naturalHeight: { value: 640 } });
  return result;
}
async function mount(running = false) {
  const props = reactive({ image: image(), running });
  const host = document.createElement('div');
  const app = createApp({ render: () => h(Fountain, props) });
  app.mount(host);
  cleanup = () => app.unmount();
  await nextTick();
  return { props, host };
}
function tick(time: number) {
  for (const [id, callback] of [...frames]) {
    frames.delete(id);
    callback(time);
  }
}

describe('墨泉动效生命周期', () => {
  it('只在运行时绘制，限制帧率，暂停和卸载彻底取消绘制队列', async () => {
    const { props } = await mount();
    expect(frames.size).toBe(0);
    props.running = true;
    await nextTick();
    expect(frames.size).toBe(1);
    tick(0);
    const firstFrame = context.drawImage.mock.calls.length;
    expect(firstFrame).toBeGreaterThan(0);
    tick(10);
    expect(context.drawImage).toHaveBeenCalledTimes(firstFrame);
    tick(40);
    expect(context.drawImage).toHaveBeenCalledTimes(firstFrame * 2);
    props.running = false;
    await nextTick();
    expect(frames.size).toBe(0);
    props.running = true;
    await nextTick();
    const nextImage = image();
    props.image = nextImage;
    await nextTick();
    expect(frames.size).toBe(1);
    tick(200);
    expect(context.drawImage.mock.lastCall?.[0]).toBe(nextImage);
    cleanup?.();
    cleanup = undefined;
    expect(frames.size).toBe(0);
  });

  it('Canvas 不可用时不启动绘制，纸笺和底图调用方仍可展示', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const { host } = await mount(true);
    expect(frames.size).toBe(0);
    expect(host.querySelectorAll('img')).toHaveLength(2);
    expect(context.drawImage).not.toHaveBeenCalled();
  });
});

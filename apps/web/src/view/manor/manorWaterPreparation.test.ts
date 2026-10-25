// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const module = {
  exports: {} as {
    sourceURL: (path: string, base: string) => string;
    textureSize: (w: number, h: number, display: number, dpr?: number, limit?: number) => { width: number; height: number };
    shorelineMask: (p: Uint8ClampedArray, w: number, h: number) => Uint8Array;
    surfaceMask: (p: Uint8ClampedArray, s: Uint8ClampedArray, w: number, h: number, r?: number) => Uint8Array;
    prepareTextures: (
      data: unknown,
      canvas: Function,
      pause: Function,
    ) => Promise<{ pixels: Uint8Array; maskWidth: number; maskHeight: number }>;
  },
};
runInNewContext(
  readFileSync(new URL('../../../public/manor/knowledge-garden-v19/garden-environment.js', import.meta.url), 'utf8'),
  { module, URL },
);
const water = module.exports;
describe('庄园水面准备', () => {
  it('合并脚本的 Worker 模块地址解析为绝对 URL，并保留版本而不携带宿主桥接参数', () => {
    const base = 'https://boluo66.top/manor/index.html?bridge=private-fixture';
    expect(water.sourceURL('knowledge-garden-v19/garden-environment.js?v=abc123', base))
      .toBe('https://boluo66.top/manor/knowledge-garden-v19/garden-environment.js?v=abc123');
    expect(water.sourceURL('https://boluo66.top/manor/environment.js?v=xyz', base))
      .toBe('https://boluo66.top/manor/environment.js?v=xyz');
  });
  it('保留原图与高分屏所需分辨率，按 GPU 上限约束尺寸而不扩充到二次幂', () => {
    expect(water.textureSize(1808, 870, 1470, 1)).toEqual({ width: 1808, height: 870 });
    expect(water.textureSize(1808, 870, 1470, 2)).toEqual({ width: 2940, height: 1415 });
    expect(water.textureSize(919, 1712, 393, 2)).toEqual({ width: 919, height: 1712 });
    const capped = water.textureSize(1808, 870, 3000, 2, 4096);
    expect(capped.width).toBeLessThanOrEqual(4096);expect(capped.height).toBeLessThanOrEqual(4096);
  });
  it('蓝水保留、岸上像素排除，鱼舱顶面完全退出动态遮罩', () => {
    const categories = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255]);
    const scene = new Uint8ClampedArray([15, 140, 210, 255, 75, 55, 20, 255, 200, 200, 200, 255, 15, 140, 210, 255]);
    const result = water.surfaceMask(categories, scene, 4, 1);
    expect([...result.filter((_v, i) => i % 4 !== 3)]).toEqual([255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result[3]).toBe(8);
    expect(result[7]).toBe(0);
    expect(result[11]).toBe(0);
    expect(result[15]).toBe(0);
  });
  it('没有 OffscreenCanvas 时也分批让出主线程，结果使用相同水域算法', async () => {
    let maskReads = 0;
    const canvas = (width: number, height: number) => ({
      width,
      height,
      getContext: () => ({
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        filter: '',
        imageSmoothingQuality: '',
        getImageData: () => {
          const pixels = new Uint8ClampedArray(width * height * 4),
            mask = maskReads++ === 0;
          for (let p = 0; p < pixels.length; p += 4) pixels.set(mask ? [255, 0, 0, 255] : [15, 140, 210, 255], p);
          return { data: pixels };
        },
      }),
    });
    const pause = vi.fn(async () => {});
    const result = await water.prepareTextures(
      {
        width: 64,
        height: 48,
        displayWidth: 64,
        image: { width: 64, height: 48 },
        details: [],
        mask: { width: 64, height: 48 },
      },
      canvas,
      pause,
    );
    expect(pause.mock.calls.length).toBeGreaterThan(5);
    expect(result.maskWidth).toBe(64);
    expect(result.maskHeight).toBe(48);
    expect(result.pixels.length).toBe(64 * 48 * 4);
    expect([...result.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });
});

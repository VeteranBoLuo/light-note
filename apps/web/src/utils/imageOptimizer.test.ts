import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_OPTIMIZER_MAX_BYTES,
  IMAGE_OPTIMIZER_MAX_FILES,
  IMAGE_OPTIMIZER_MAX_OUTPUT_PIXELS,
  ImageOptimizerError,
  optimizeImage,
  releaseOptimizedImages,
  validateImageFiles,
} from './imageOptimizer';

describe('图片压缩器输入边界', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('接受一期声明的三种浏览器图片格式', () => {
    expect(() =>
      validateImageFiles([
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.png', { type: 'image/png' }),
        new File(['c'], 'c.webp', { type: 'image/webp' }),
        new File(['d'], 'camera.JPEG'),
      ]),
    ).not.toThrow();
  });

  it('拒绝未知格式与超过批量上限的输入', () => {
    expect(() => validateImageFiles([new File(['x'], 'x.gif', { type: 'image/gif' })])).toThrowError(
      expect.objectContaining<ImageOptimizerError>({ code: 'INVALID_TYPE' }),
    );
    const tooMany = Array.from(
      { length: IMAGE_OPTIMIZER_MAX_FILES + 1 },
      (_, index) => new File(['x'], `${index}.png`, { type: 'image/png' }),
    );
    expect(() => validateImageFiles(tooMany)).toThrowError(expect.objectContaining({ code: 'TOO_MANY' }));
  });

  it('拒绝超过批量体积上限的输入', () => {
    const oversized = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: IMAGE_OPTIMIZER_MAX_BYTES + 1 });
    expect(() => validateImageFiles([oversized])).toThrowError(expect.objectContaining({ code: 'TOO_LARGE' }));
  });

  it('显式限制尺寸时缩小超大图片，并在结果释放时回收对象 URL', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10_000, height: 5_000, close }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      fillRect: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
      callback(new Blob(['optimized'], { type: type || 'image/webp' }));
    });
    const createObjectUrl = vi.fn().mockReturnValue('blob:optimized');
    const revokeObjectUrl = vi.fn().mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });

    const output = await optimizeImage(new File(['source'], 'large.png', { type: 'image/png' }), {
      format: 'image/webp',
      quality: 0.8,
      maxDimension: 4_000,
    });

    expect(output.width * output.height).toBeLessThanOrEqual(IMAGE_OPTIMIZER_MAX_OUTPUT_PIXELS);
    expect(output.width).toBeLessThan(10_000);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(createObjectUrl).toHaveBeenCalledOnce();

    releaseOptimizedImages([output]);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:optimized');
  });

  it('不设置尺寸限制时拒绝静默缩小超出安全像素的图片', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10_000, height: 5_000, close }));

    await expect(
      optimizeImage(new File(['source'], 'large.png', { type: 'image/png' }), {
        format: 'image/webp',
        quality: 0.8,
        maxDimension: null,
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_PIXELS' });
    expect(close).toHaveBeenCalledOnce();
  });
});

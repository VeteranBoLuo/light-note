import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareCommunityChatSticker } from './prepareCommunityChatSticker';

const STICKER_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxEdge: 4096,
  maxPixels: 8_000_000,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

function installImageAndCanvasMocks(
  encodedBlob: Blob,
  dimensions: { width: number; height: number } = { width: 2400, height: 1200 },
) {
  const createObjectURL = vi.fn(() => 'blob:sticker-test');
  const revokeObjectURL = vi.fn(() => undefined);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  class ImageStub {
    naturalWidth = dimensions.width;
    naturalHeight = dimensions.height;
    width = dimensions.width;
    height = dimensions.height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', ImageStub);
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(encodedBlob));
  return { createObjectURL, revokeObjectURL, drawImage };
}

describe('prepareCommunityChatSticker', () => {
  it('keeps an image that already fits the server limit unchanged', async () => {
    const source = new File(['small'], 'small.png', { type: 'image/png' });
    const mocks = installImageAndCanvasMocks(new Blob(['unused'], { type: 'image/webp' }), {
      width: 320,
      height: 240,
    });

    await expect(prepareCommunityChatSticker(source, STICKER_LIMITS)).resolves.toEqual({
      file: source,
      compressed: false,
    });
    expect(mocks.drawImage).not.toHaveBeenCalled();
  });

  it('compresses a high-resolution image even when its file size is under 2MiB', async () => {
    const source = new File(['high-resolution-but-small-jpeg'], 'phone-photo.jpg', { type: 'image/jpeg' });
    const mocks = installImageAndCanvasMocks(new Blob(['optimized'], { type: 'image/webp' }), {
      width: 3072,
      height: 4096,
    });

    const result = await prepareCommunityChatSticker(source, STICKER_LIMITS);

    expect(source.size).toBeLessThan(STICKER_LIMITS.maxBytes);
    expect(result.compressed).toBe(true);
    expect(result.file.name).toBe('phone-photo.webp');
    expect(mocks.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1200, 1600);
  });

  it('compresses an oversized image to a high-quality WebP before upload', async () => {
    const source = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
      lastModified: 123,
    });
    const mocks = installImageAndCanvasMocks(new Blob(['compressed'], { type: 'image/webp' }));

    const result = await prepareCommunityChatSticker(source, STICKER_LIMITS);

    expect(result.compressed).toBe(true);
    expect(result.file).not.toBe(source);
    expect(result.file.name).toBe('large.webp');
    expect(result.file.type).toBe('image/webp');
    expect(result.file.lastModified).toBe(123);
    expect(mocks.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
    expect(mocks.createObjectURL).toHaveBeenCalledWith(source);
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:sticker-test');
  });

  it('keeps PNG transparency when the browser cannot encode WebP', async () => {
    const source = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'transparent.png', { type: 'image/png' });
    installImageAndCanvasMocks(new Blob(['transparent-compressed'], { type: 'image/png' }));

    const result = await prepareCommunityChatSticker(source, STICKER_LIMITS);

    expect(result.compressed).toBe(true);
    expect(result.file.name).toBe('transparent.png');
    expect(result.file.type).toBe('image/png');
  });

  it('returns the smallest compressed candidate when the image still exceeds the limit', async () => {
    const maxBytes = 2 * 1024 * 1024;
    const source = new File([new Uint8Array(maxBytes + 1)], 'noisy.jpg', { type: 'image/jpeg' });
    const stillTooLarge = new Blob([new Uint8Array(maxBytes + 64)], { type: 'image/webp' });
    installImageAndCanvasMocks(stillTooLarge);

    const result = await prepareCommunityChatSticker(source, { ...STICKER_LIMITS, maxBytes });

    expect(result.compressed).toBe(true);
    expect(result.file.type).toBe('image/webp');
    expect(result.file.size).toBeGreaterThan(maxBytes);
  });
});

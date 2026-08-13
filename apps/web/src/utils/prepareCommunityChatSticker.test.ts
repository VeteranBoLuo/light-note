import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareCommunityChatSticker } from './prepareCommunityChatSticker';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

function installImageAndCanvasMocks(encodedBlob: Blob) {
  const createObjectURL = vi.fn(() => 'blob:sticker-test');
  const revokeObjectURL = vi.fn(() => undefined);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  class ImageStub {
    naturalWidth = 2400;
    naturalHeight = 1200;
    width = 2400;
    height = 1200;
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

    await expect(prepareCommunityChatSticker(source, 2 * 1024 * 1024)).resolves.toEqual({
      file: source,
      compressed: false,
    });
  });

  it('compresses an oversized image to a high-quality WebP before upload', async () => {
    const source = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
      lastModified: 123,
    });
    const mocks = installImageAndCanvasMocks(new Blob(['compressed'], { type: 'image/webp' }));

    const result = await prepareCommunityChatSticker(source, 2 * 1024 * 1024);

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

    const result = await prepareCommunityChatSticker(source, 2 * 1024 * 1024);

    expect(result.compressed).toBe(true);
    expect(result.file.name).toBe('transparent.png');
    expect(result.file.type).toBe('image/png');
  });

  it('returns the smallest compressed candidate when the image still exceeds the limit', async () => {
    const maxBytes = 2 * 1024 * 1024;
    const source = new File([new Uint8Array(maxBytes + 1)], 'noisy.jpg', { type: 'image/jpeg' });
    const stillTooLarge = new Blob([new Uint8Array(maxBytes + 64)], { type: 'image/webp' });
    installImageAndCanvasMocks(stillTooLarge);

    const result = await prepareCommunityChatSticker(source, maxBytes);

    expect(result.compressed).toBe(true);
    expect(result.file.type).toBe('image/webp');
    expect(result.file.size).toBeGreaterThan(maxBytes);
  });
});

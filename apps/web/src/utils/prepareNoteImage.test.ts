import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ optimize: vi.fn(), release: vi.fn() }));
vi.mock('./imageOptimizer', () => ({ optimizeImage: mocks.optimize, releaseOptimizedImages: mocks.release }));
import { jpegDimensions, prepareNoteImage } from './prepareNoteImage';
function jpeg(width = 4000, height = 3000, size = 800 * 1024) {
  const bytes = new Uint8Array(size);
  bytes.set([255, 216, 255, 192, 0, 8, 8, height >> 8, height & 255, width >> 8, width & 255, 0]);
  const file = new File([bytes], 'photo.jpg', { type: 'image/jpeg' });
  // jsdom Blob lacks arrayBuffer in this repository's test runtime.
  Object.defineProperty(file, 'slice', { value: () => ({ arrayBuffer: async () => bytes.buffer }) });
  return file;
}
beforeEach(() => {
  vi.clearAllMocks();
});
describe('note-only image preparation', () => {
  it('accepts high-benefit WebP with matching filename and releases its preview', async () => {
    const blob = new Blob([new Uint8Array(150 * 1024)], { type: 'image/webp' });
    mocks.optimize.mockResolvedValue({ blob, previewUrl: 'blob:temporary' });
    expect(await prepareNoteImage(jpeg(), 'photo.jpg')).toEqual({ file: blob, fileName: 'photo.webp' });
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it('preserves original choice, long screenshots and unrecognized formats without decoding', async () => {
    for (const [file, original] of [
      [jpeg(), true],
      [jpeg(1000, 9000), false],
      [new File(['png'], 'a.png', { type: 'image/png' }), false],
    ] as const) {
      expect((await prepareNoteImage(file, file.name, original)).file).toBe(file);
    }
    expect(mocks.optimize).not.toHaveBeenCalled();
    expect(jpegDimensions(new Uint8Array([255, 216, 255, 192, 0, 1]))).toBeNull();
  });
  it('falls back on insufficient benefit, unsupported encoding and failure', async () => {
    const file = jpeg();
    for (const blob of [
      new Blob([new Uint8Array(790 * 1024)], { type: 'image/webp' }),
      new Blob(['small'], { type: 'image/png' }),
    ]) {
      mocks.optimize.mockResolvedValue({ blob });
      expect((await prepareNoteImage(file, file.name)).file).toBe(file);
    }
    mocks.optimize.mockRejectedValue(new Error('decode failure'));
    expect((await prepareNoteImage(file, file.name)).file).toBe(file);
  });
  it('serializes decoding across multiple upload callers', async () => {
    let running = 0;
    let maximum = 0;
    mocks.optimize.mockImplementation(async () => {
      maximum = Math.max(maximum, ++running);
      await Promise.resolve();
      running--;
      return { blob: new Blob(['tiny'], { type: 'image/webp' }) };
    });
    await Promise.all([prepareNoteImage(jpeg(), 'a.jpg'), prepareNoteImage(jpeg(), 'b.jpg')]);
    expect(maximum).toBe(1);
  });
});

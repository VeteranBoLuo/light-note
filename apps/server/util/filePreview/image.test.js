import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import { convertImagePreview, imageIsAnimated, imagePreviewDescriptor } from './image.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64');
// Valid WebP header for a 1x1 still image.
const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
describe('image preview conversion', () => {
  it('rejects invalid bytes and excessive pixels before starting a child process', async () => {
    const runner = vi.fn();
    await expect(convertImagePreview({ buffer: Buffer.from('bad'), strategy: 'image_thumbnail', runner })).rejects.toMatchObject({ code: 'FILE_CONTENT_INVALID' });
    const oversized = Buffer.from(png); oversized.writeUInt32BE(100000, 16); oversized.writeUInt32BE(100000, 20);
    await expect(convertImagePreview({ buffer: oversized, strategy: 'image_thumbnail', runner })).rejects.toMatchObject({ code: 'IMAGE_PREVIEW_DIMENSIONS_INVALID' });
    expect(runner).not.toHaveBeenCalled();
  });
  it('outputs a distinct WebP with bounded resources, keeping source bytes unchanged', async () => {
    const input = Buffer.concat([png, Buffer.alloc(1000)]); const before = Buffer.from(input);
    const runner = vi.fn(async (_bin, args, options) => {
      expect(options.env).not.toHaveProperty('OBS_SK');
      expect(options.env.MAGICK_THREAD_LIMIT).toBe('1');
      expect(args).toEqual(expect.arrayContaining(['-auto-orient', 'sRGB', '720x720>', '78']));
      await fs.writeFile(args.at(-1), webp);
    });
    const result = await convertImagePreview({ buffer: input, strategy: 'image_thumbnail', runner });
    expect(result).toMatchObject({ mode: 'derived', width: 1, height: 1 });
    expect(input.equals(before)).toBe(true);
  });
  it('keeps transparency with lossless PNG display and refuses inflated large outputs', async () => {
    const input = Buffer.concat([png, Buffer.alloc(350 * 1024)]);
    const runner = vi.fn(async (_bin, args) => {
      expect(args).toContain('webp:lossless=true');
      await fs.writeFile(args.at(-1), Buffer.concat([webp, Buffer.alloc(input.length)]));
    });
    await expect(convertImagePreview({ buffer: input, strategy: 'image_display', runner })).rejects.toMatchObject({ code: 'IMAGE_PREVIEW_NO_BENEFIT' });
  });
  it('source mode never produces a derived object for small nonbeneficial images', async () => {
    const result = await convertImagePreview({ buffer: png, strategy: 'image_display', runner: async (_bin, args) => fs.writeFile(args.at(-1), Buffer.concat([webp, Buffer.alloc(100)])) });
    expect(result).toMatchObject({ mode: 'source' }); expect(result.buffer).toBeUndefined();
  });
  it('detects APNG and animated WebP chunks and does not globally register chat file formats', () => {
    const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8, 0); chunk.write('acTL', 4);
    expect(imageIsAnimated(Buffer.concat([png.subarray(0, 8), chunk]), 'png')).toBe(true);
    const riff = Buffer.alloc(20); riff.write('ANIM', 12);
    expect(imageIsAnimated(riff, 'webp')).toBe(true);
    expect(imageIsAnimated(png, 'png')).toBe(false);
    expect(() => imagePreviewDescriptor({ file_name: 'a.pdf' }, 'image_display')).toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectImageFormat, IMAGE_HEADER_BYTES } from './format.js';
import { validateSource } from './compress.js';
import { resolveImageSourcePreview } from './sourcePreview.js';
const exec = promisify(execFile);

describe('verified image formats', () => {
  it.each(['jpg', 'png', 'gif', 'webp'])(
    'uses the same actual %s format for thumbnails and original previews',
    async (type) => {
      const { stdout: body } = await exec('convert', ['-size', '12x8', 'xc:red', `${type}:-`], { encoding: 'buffer' });
      const metadata = vi.fn(async () => ({ contentLength: body.length }));
      const readRange = vi.fn(async () => body);
      const sign = vi.fn(() => ({ url: 'https://preview.test/original' }));
      const file = {
        id: 7,
        create_by: 'owner',
        file_name: 'wrong.heic',
        file_type: 'image/heic',
        file_size: body.length,
        obs_key: 'owned-key',
      };
      const state = await resolveImageSourcePreview(file, { metadata, readRange, sign });
      expect(validateSource(body).type).toBe(type);
      expect(state).toMatchObject({
        previewType: 'image',
        status: 'ready',
        formatId: type,
        sourceDownloadUrl: 'https://preview.test/original',
      });
      expect(state.sourceMimeType).toBe(detectImageFormat(body).mimeType);
      expect(sign).toHaveBeenCalledWith({
        objectKey: 'owned-key',
        expires: 600,
        responseContentType: detectImageFormat(body).mimeType,
      });
      expect(readRange).toHaveBeenCalledWith('owned-key', 0, body.length - 1);
    },
  );

  it('reports real HEIF and non-image bytes as unsupported instead of trusting their names', async () => {
    const heif = Buffer.alloc(24);
    heif.writeUInt32BE(24);
    heif.write('ftypheic', 4);
    heif.write('mif1heic', 16);
    for (const body of [heif, Buffer.from('<html><svg></svg></html>')]) {
      const sign = vi.fn();
      const state = await resolveImageSourcePreview(
        { id: 1, obs_key: 'key', file_size: body.length },
        {
          metadata: async () => ({ contentLength: body.length }),
          readRange: async () => body,
          sign,
        },
      );
      expect(state).toMatchObject({
        previewType: 'unsupported',
        status: 'failed',
        errorCode: 'IMAGE_SOURCE_UNSUPPORTED',
      });
      expect(() => validateSource(body)).toThrow('IMAGE_SOURCE_UNSUPPORTED');
      expect(sign).not.toHaveBeenCalled();
    }
    expect(detectImageFormat(heif)?.type).toBe('heif');
  });

  it('bounds reads for large originals and fails before reading when the source size changed', async () => {
    const readRange = vi.fn(async () => Buffer.from('not an image'));
    await resolveImageSourcePreview(
      { id: 1, obs_key: 'key', file_size: 20_000_000 },
      {
        metadata: async () => ({ contentLength: 20_000_000 }),
        readRange,
      },
    );
    expect(readRange).toHaveBeenCalledWith('key', 0, IMAGE_HEADER_BYTES - 1);
    readRange.mockClear();
    await expect(
      resolveImageSourcePreview(
        { id: 1, obs_key: 'key', file_size: 20 },
        {
          metadata: async () => ({ contentLength: 21 }),
          readRange,
        },
      ),
    ).rejects.toMatchObject({ code: 'FILE_SIZE_MISMATCH' });
    expect(readRange).not.toHaveBeenCalled();
  });

  it('preserves native SVG and AVIF preview without enabling unsupported thumbnail decoders', () => {
    expect(
      detectImageFormat(Buffer.from('<?xml version="1.0"?><!-- title --><svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toMatchObject({ type: 'svg', previewable: true, thumbnailSupported: false });
    const avif = Buffer.alloc(24);
    avif.writeUInt32BE(24);
    avif.write('ftypavif', 4);
    avif.write('mif1avif', 16);
    expect(detectImageFormat(avif)).toMatchObject({ type: 'avif', previewable: true, thumbnailSupported: false });
    expect(detectImageFormat(Buffer.from('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg/>'))?.type).toBe('svg');
  });

  it('caps attachment URLs at their remaining lifetime and never signs expired sources', async () => {
    const body = Buffer.from([255, 216, 255, 224]);
    const sign = vi.fn(() => ({ url: 'short-lived-original' }));
    const dependencies = { metadata: async () => ({ contentLength: body.length }), readRange: async () => body, sign };
    const file = { id: 1, obs_key: 'key', file_size: body.length, expires_at: new Date(Date.now() + 30_000) };
    const state = await resolveImageSourcePreview(file, dependencies);
    expect(state.sourceUrlExpiresIn).toBeGreaterThan(0);
    expect(state.sourceUrlExpiresIn).toBeLessThanOrEqual(30);
    sign.mockClear();
    await expect(resolveImageSourcePreview({ ...file, expires_at: new Date(Date.now() - 1) }, dependencies)).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_FILE_EXPIRED', status: 410 });
    expect(sign).not.toHaveBeenCalled();
  });
});

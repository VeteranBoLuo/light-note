import { describe, it, expect, vi, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readVideoCover, VIDEO_COVER_MAX_BYTES, inspectVideoPreviewRuntime } from './videoCover.js';
import { validatePreview } from './compress.js';
import { imageFailure } from './errors.js';
import { isVideoCoverFile } from '@lightnote/shared';
const exec = promisify(execFile);
let webp;
beforeAll(async () => {
  webp = (await exec('convert', ['-size', '8x8', 'xc:blue', 'webp:-'], { encoding: 'buffer' })).stdout;
});
function fixture({
  size = 10,
  info = { streams: [{ width: 1920, height: 1080 }], format: { duration: '12.5' } },
} = {}) {
  let dir;
  const runner = vi.fn(async (_bin, args, options) => {
    dir = options.env.TMPDIR;
    expect(options.env.OBS_SK).toBeUndefined();
    expect(args).toContain('file,pipe');
    expect(options.timeout).toBeLessThanOrEqual(30000);
    if (args.includes('-show_entries')) return { stdout: JSON.stringify(info) };
    await fs.writeFile(args.at(-1), webp);
    return { stdout: '' };
  });
  const read = vi.fn(async (_key, start, end, options) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(end - start + 1).toBeLessThanOrEqual(4 * 1024 * 1024);
    return Buffer.alloc(end - start + 1, 1);
  });
  return { runner, read, metadata: { size, version: 'etag-version' }, dir: () => dir };
}
describe('bounded video cover generation', () => {
  it('recognizes video filenames without treating a bare name as an extension', () => {
    expect(isVideoCoverFile('clip.MOV')).toBe(true);
    expect(isVideoCoverFile('clip.mp4')).toBe(true);
    expect(isVideoCoverFile('MOV')).toBe(false);
    expect(isVideoCoverFile('notes.mov.txt')).toBe(false);
    expect(isVideoCoverFile(null)).toBe(false);
  });
  it('streams bounded ranges, hashes original bytes and persists duration independently of WebP size', async () => {
    const f = fixture({ size: 4 * 1024 * 1024 + 7 });
    const result = await readVideoCover('controlled-key', f.metadata, f.read, { runner: f.runner });
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ durationSeconds: 12.5, sourceSize: f.metadata.size, version: 'etag-version' });
    expect(result.revision).toBe(createHash('sha256').update(Buffer.alloc(f.metadata.size, 1)).digest('hex'));
    expect(validatePreview(result.body).type).toBe('webp');
    await expect(fs.stat(f.dir())).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects oversized inputs before download', async () => {
    const f = fixture({ size: VIDEO_COVER_MAX_BYTES + 1 });
    await expect(readVideoCover('key', f.metadata, f.read, { runner: f.runner })).rejects.toMatchObject({
      code: 'IMAGE_VIDEO_SIZE_LIMIT',
    });
    expect(f.read).not.toHaveBeenCalled();
    expect(f.runner).not.toHaveBeenCalled();
  });
  it('rejects incomplete ranges without decoding', async () => {
    const f = fixture();
    f.read.mockResolvedValue(Buffer.from('short'));
    await expect(readVideoCover('key', f.metadata, f.read, { runner: f.runner })).rejects.toMatchObject({
      code: 'IMAGE_SOURCE_CHANGED',
    });
    expect(f.runner).not.toHaveBeenCalled();
  });
  it.each([
    [{ streams: [] }, 'IMAGE_VIDEO_DECODE_FAILED'],
    [{ streams: [{ width: 100000, height: 100000 }] }, 'IMAGE_VIDEO_RESOURCE_LIMIT'],
  ])('rejects absent video streams or excessive decoded dimensions', async (info, code) => {
    const f = fixture({ info });
    await expect(readVideoCover('key', f.metadata, f.read, { runner: f.runner })).rejects.toMatchObject({ code });
    expect(f.runner).toHaveBeenCalledTimes(1);
    await expect(fs.stat(f.dir())).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it.each([
    [{ code: 'ENOENT' }, 'IMAGE_RUNTIME_UNAVAILABLE'],
    [{ stderr: 'dyld: Library not loaded: missing runtime dependency' }, 'IMAGE_RUNTIME_UNAVAILABLE'],
    [{ killed: true }, 'IMAGE_PROCESS_TIMEOUT'],
    [{ stderr: 'private decoder detail' }, 'IMAGE_VIDEO_DECODE_FAILED'],
  ])('classifies decoder failures without exposing process detail', async (error, code) => {
    const f = fixture();
    f.runner.mockRejectedValue(error);
    await expect(readVideoCover('key', f.metadata, f.read, { runner: f.runner })).rejects.toMatchObject({
      code,
      message: code,
    });
  });
  it('does not automatically retry permanent video failures', () => {
    expect(imageFailure('IMAGE_VIDEO_DECODE_FAILED')).toMatchObject({ retryable: false, failureKind: 'source' });
    expect(imageFailure('IMAGE_VIDEO_SIZE_LIMIT')).toMatchObject({ retryable: false, failureKind: 'resource_limit' });
    expect(imageFailure('IMAGE_VIDEO_RESOURCE_LIMIT')).toMatchObject({
      retryable: false,
      failureKind: 'resource_limit',
    });
  });
  it('fails the runtime gate if frame extraction is not available', async () => {
    expect(
      await inspectVideoPreviewRuntime({ runner: async () => ({ stdout: Buffer.from('invalid') }) }),
    ).toMatchObject({ ready: false });
  });
});

describe.runIf(process.env.VIDEO_PREVIEW_TEST_RUNTIME === 'true')('real video decoding', () => {
  it.each([
    ['mov', 'libx264', '1280x720'],
    ['mp4', 'libx264', '1280x720'],
    ['mov', 'libx265', '320x180'],
    ['mov', 'libx264', '90x720'],
  ])(
    'extracts a bounded poster and duration from real %s / %s / %s bytes',
    async (format, codec, dimensions) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-video-test-'));
      try {
        const input = path.join(dir, `clip.${format}`);
        await exec(process.env.VIDEO_PREVIEW_FFMPEG_BIN || 'ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          `testsrc2=size=${dimensions}:rate=24`,
          '-t',
          '2',
          '-c:v',
          codec,
          '-threads',
          '1',
          '-pix_fmt',
          'yuv420p',
          input,
        ]);
        const bytes = await fs.readFile(input);
        const result = await readVideoCover(
          'fixture',
          { size: bytes.length, version: 'fixture' },
          async (_key, start, end) => bytes.subarray(start, end + 1),
        );
        expect(result.durationSeconds).toBeCloseTo(2, 1);
        expect(result.preview.width).toBeLessThanOrEqual(720);
        expect(result.preview.height).toBeLessThanOrEqual(720);
        expect(result.body.length).toBeLessThanOrEqual(150 * 1024);
        if (dimensions === '90x720') expect(result.preview.height / result.preview.width).toBeCloseTo(8, 1);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
    20000,
  );
});

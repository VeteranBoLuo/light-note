import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { compressCommunityImage, COMMUNITY_IMAGE_PREVIEW_PROFILE } from './compress.js';

const exec = promisify(execFile);
const render = async (args) =>
  (await exec('convert', args, { encoding: 'buffer', maxBuffer: 30 * 1024 * 1024 })).stdout;
async function pixels(body) {
  const pending = exec('convert', ['-', '-depth', '8', 'rgba:-'], { encoding: 'buffer', maxBuffer: 30 * 1024 * 1024 });
  pending.child.stdin.end(body);
  return (await pending).stdout;
}

describe('community image previews', () => {
  it('keeps screenshot pixels lossless when a compact WebP is available', async () => {
    const original = await render([
      '-size',
      '1200x600',
      'xc:white',
      '-fill',
      '#653bcc',
      '-draw',
      'rectangle 20,20 119,579',
      '-fill',
      '#222222',
      '-draw',
      'rectangle 200,80 1000,82',
      'png:-',
    ]);
    const result = await compressCommunityImage(original);
    expect(result).toMatchObject({ width: 1200, height: 600, presentation: 'full' });
    expect(result.body.length).toBeLessThan(original.length);
    const digest = (body) => createHash('sha256').update(body).digest('hex');
    expect(digest(await pixels(result.body))).toBe(digest(await pixels(original)));
  });
  it('preserves the full bottom of tall images instead of applying the card crop', async () => {
    const original = await render([
      '-size',
      '800x8000',
      'xc:red',
      '-fill',
      'blue',
      '-draw',
      'rectangle 0,4000 799,7999',
      'png:-',
    ]);
    const result = await compressCommunityImage(original);
    expect(result).toMatchObject({ width: 600, height: 6000, presentation: 'full' });
    expect(result.width * result.height).toBeLessThanOrEqual(COMMUNITY_IMAGE_PREVIEW_PROFILE.pixels);
    const rgba = await pixels(result.body);
    expect([...rgba.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect([...rgba.subarray(-4, -1)]).toEqual([0, 0, 255]);
  });
  it('creates a bounded full preview from a large JPEG without changing the original buffer', async () => {
    const original = await render(['-size', '2400x1600', 'gradient:blue-red', 'jpg:-']);
    const before = Buffer.from(original);
    const result = await compressCommunityImage(original);
    expect(result.presentation).toBe('full');
    expect(result.width).toBeLessThanOrEqual(1600);
    expect(Math.abs(result.width / result.height - 1.5)).toBeLessThan(0.003);
    expect(original).toEqual(before);
  });
  it('reuses an already compact WebP without another lossy pass', async () => {
    const original = await render(['-size', '400x200', 'gradient:red-blue', 'webp:-']);
    expect(await compressCommunityImage(original)).toBeNull();
  });
  it('removes temporary files after a missing decoder and rejects oversize input early', async () => {
    const original = await render(['-size', '20x20', 'xc:red', 'png:-']);
    let temporaryDirectory;
    await expect(
      compressCommunityImage(original, {
        runner: async (_bin, _args, options) => {
          temporaryDirectory = options.env.TMPDIR;
          throw Object.assign(new Error('private runtime path'), { code: 'ENOENT' });
        },
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_RUNTIME_UNAVAILABLE' });
    await expect(fs.access(temporaryDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(compressCommunityImage(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toMatchObject({
      code: 'IMAGE_SOURCE_SIZE_LIMIT',
    });
  });
});

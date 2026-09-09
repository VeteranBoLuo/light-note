import { describe, it, expect, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compressCardImage, validateSource, validatePreview, CARD_PROFILE } from './compress.js';
import { extractManagedImages } from './extract.js';
const exec = promisify(execFile);
describe('managed image compression', () => {
  it.each(['png', 'jpg', 'gif', 'webp'])('compresses actual %s bytes into a bounded WebP', async (format) => {
    const { stdout } = await exec('convert', ['-size', '1400x900', 'gradient:blue-red', `${format}:-`], {
      encoding: 'buffer',
    });
    const result = await compressCardImage(stdout);
    expect(validatePreview(result.body).type).toBe('webp');
    expect(result.width).toBeLessThanOrEqual(720);
    expect(result.height).toBeLessThanOrEqual(720);
    expect(result.body.length).toBeLessThanOrEqual(CARD_PROFILE.maxBytes);
    expect(result.body.equals(stdout)).toBe(false);
  });
  it('keeps tiny transparent images small without enlarging', async () => {
    const { stdout } = await exec('convert', ['-size', '8x8', 'xc:none', 'png:-'], { encoding: 'buffer' });
    const r = await compressCardImage(stdout);
    expect(r.width).toBe(8);
    expect(r.height).toBe(8);
  });
  it('rejects corrupt and oversized sources before invoking a decoder', async () => {
    const runner = vi.fn();
    await expect(compressCardImage(Buffer.from('bad'), { runner })).rejects.toMatchObject({
      code: 'IMAGE_SOURCE_UNSUPPORTED',
    });
    expect(runner).not.toHaveBeenCalled();
    expect(() => validateSource(Buffer.alloc(50 * 1024 * 1024 + 1))).toThrow('IMAGE_SOURCE_SIZE_LIMIT');
  });
  it('stops at the shared deadline', async () => {
    const { stdout } = await exec('convert', ['-size', '1x1', 'xc:red', 'png:-'], { encoding: 'buffer' });
    let now = 0;
    await expect(
      compressCardImage(stdout, {
        now: () => {
          now += 61000;
          return now;
        },
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_PROCESS_TIMEOUT' });
  });
});
describe('saved-content image references', () => {
  const url = 'https://boluo66.top/uploads/a.png';
  it('ignores links and code while parsing Markdown images', () => {
    expect(extractManagedImages(`[link](${url})\n\n\`![code](${url})\`\n\n![real](${url})`, 'markdown')).toEqual([url]);
    expect(extractManagedImages(`\`![code](${url})\``, 'markdown')).toEqual([]);
  });
  it('detects deletion from the saved document regardless of editor key', () => {
    expect(extractManagedImages(`<p><img src="${url}"></p>`)).toEqual([url]);
    expect(extractManagedImages('<p></p>')).toEqual([]);
    expect(extractManagedImages(`<a href="${url}">image URL</a>`)).toEqual([]);
  });
  it('normalizes encoded paths and excludes external sources', () => {
    expect(
      extractManagedImages(
        '<img src="https://external.test/a.png"><img src="https://boluo66.top/uploads/hello%20world.png">',
      ),
    ).toEqual(['https://boluo66.top/uploads/hello%20world.png']);
  });
});

describe('large and tall real-image regression', () => {
  it.each(['7999x8000', '8000x8000', '8001x8000', '10000x10000'])(
    'converts actual %s PNG above and below the old pixel limit',
    async (size) => {
      const { stdout } = await exec('convert', ['-size', size, 'xc:#6495ed', '-depth', '8', 'png:-'], {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024,
      });
      const result = await compressCardImage(stdout);
      expect(result.presentation).toBe('full');
      expect(validatePreview(result.body).type).toBe('webp');
      expect(result.width).toBeLessThanOrEqual(720);
    },
    120000,
  );
  it.each([300, 301])('crops only above the 3:1 boundary (%s)', async (height) => {
    const { stdout } = await exec(
      'convert',
      ['-size', `100x${height}`, 'xc:red', '-fill', 'blue', '-draw', `rectangle 0,150 99,${height - 1}`, 'png:-'],
      { encoding: 'buffer' },
    );
    const result = await compressCardImage(stdout);
    expect(result.presentation).toBe(height === 300 ? 'full' : 'long_top');
    expect(result.height).toBe(height === 300 ? 300 : 150);
  });
});

describe('orientation, first frame, pixels and runtime failure', () => {
  async function color(body) {
    const job = exec('convert', ['webp:-', '-format', '%[fx:mean.r] %[fx:mean.b]', 'info:']);
    job.child.stdin.end(body);
    return String((await job).stdout)
      .split(' ')
      .map(Number);
  }
  it('auto-orients EXIF before choosing and cropping the tall region', async () => {
    const { stdout: jpeg } = await exec(
      'convert',
      ['-size', '400x100', 'xc:red', '-fill', 'blue', '-draw', 'rectangle 200,0 399,99', 'jpg:-'],
      { encoding: 'buffer' },
    );
    const exif = Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000', 'hex');
    const prefix = Buffer.alloc(4);
    prefix[0] = 255;
    prefix[1] = 225;
    prefix.writeUInt16BE(exif.length + 2, 2);
    const result = await compressCardImage(Buffer.concat([jpeg.subarray(0, 2), prefix, exif, jpeg.subarray(2)]));
    expect(result.presentation).toBe('long_top');
    expect([result.width, result.height]).toEqual([100, 150]);
    const [red, blue] = await color(result.body);
    expect(red).toBeGreaterThan(0.9);
    expect(blue).toBeLessThan(0.1);
  });
  it('uses only the first animation frame', async () => {
    const { stdout } = await exec(
      'convert',
      ['-size', '40x40', 'xc:red', '-size', '40x40', 'xc:blue', '-delay', '20', 'gif:-'],
      { encoding: 'buffer' },
    );
    const result = await compressCardImage(stdout);
    const [red, blue] = await color(result.body);
    expect(red).toBeGreaterThan(0.9);
    expect(blue).toBeLessThan(0.1);
  });
  it('cleans temporary input after a missing runtime and classifies it independently of source files', async () => {
    const fs = await import('node:fs/promises');
    const { stdout } = await exec('convert', ['-size', '8x8', 'xc:red', 'png:-'], { encoding: 'buffer' });
    let directory;
    await expect(
      compressCardImage(stdout, {
        runner: async (_bin, _args, options) => {
          directory = options.env.TMPDIR;
          throw Object.assign(new Error('private executable path'), { code: 'ENOENT' });
        },
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_RUNTIME_UNAVAILABLE' });
    await expect(fs.access(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

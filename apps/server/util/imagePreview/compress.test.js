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
          now += 31000;
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

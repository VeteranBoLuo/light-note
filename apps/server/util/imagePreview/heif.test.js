import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compressCardImage, convertImageDisplay, validateSource } from './compress.js';
import { validateHeifSource, MAX_HEIF_PIXELS } from './heif.js';
import { inspectImagePreviewRuntime } from './runtime.js';
const exec = promisify(execFile);
const fixture = (name = 'primary') => fs.readFile(new URL(`./fixtures/${name}.heic`, import.meta.url));
const digest = (body) => createHash('sha256').update(body).digest('hex');

describe('real HEVC/HEIF conversion', () => {
  it('creates separate bounded WebP previews without mutating original HEIC bytes', async () => {
    const body = await fixture();
    const original = digest(body);
    expect(validateSource(body)).toMatchObject({ type: 'heic' });
    const thumbnail = await compressCardImage(body);
    const display = await convertImageDisplay(body);
    expect(thumbnail).toMatchObject({ type: 'webp', width: 48, height: 32 });
    expect(display).toMatchObject({ type: 'webp', width: 48, height: 32 });
    expect(thumbnail.body.length).toBeLessThanOrEqual(150 * 1024);
    expect(display.body.length).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(digest(body)).toBe(original);
    expect(display.body.equals(body)).toBe(false);
    const job = exec('convert', ['webp:-', '-crop', '12x12+0+0', '-format', '%[fx:mean.r] %[fx:mean.b]', 'info:']);
    job.child.stdin.end(display.body);
    const [red, blue] = String((await job).stdout)
      .trim()
      .split(/\s+/)
      .map(Number);
    expect(red).toBeGreaterThan(0.8);
    expect(blue).toBeLessThan(0.1);
  });
  it('honors HEIF rotation and keeps the full tall image in large previews', async () => {
    const oriented = await fixture('oriented');
    const display = await convertImageDisplay(oriented);
    const thumbnail = await compressCardImage(oriented);
    expect([display.width, display.height]).toEqual([32, 48]);
    expect([thumbnail.width, thumbnail.height]).toEqual([32, 48]);
    const tall = await fixture('tall');
    expect(await compressCardImage(tall)).toMatchObject({ presentation: 'long_top', width: 48, height: 72 });
    expect(await convertImageDisplay(tall)).toMatchObject({ presentation: 'full', width: 48, height: 200 });
  });
  it('rejects truncated or oversized HEIF properties before invoking native code', async () => {
    const body = await fixture();
    const runner = vi.fn();
    await expect(compressCardImage(body.subarray(0, 60), { runner })).rejects.toMatchObject({
      code: 'IMAGE_SOURCE_INVALID',
    });
    const oversized = Buffer.from(body);
    const ispe = oversized.indexOf('ispe');
    expect(ispe).toBeGreaterThan(0);
    oversized.writeUInt32BE(MAX_HEIF_PIXELS, ispe + 8);
    expect(() => validateHeifSource(oversized)).toThrow('IMAGE_RESOURCE_LIMIT');
    expect(runner).not.toHaveBeenCalled();
  });
  it('does not decode non-HEIF content as a HEIF display', async () => {
    await expect(convertImageDisplay(Buffer.from('not a photo'))).rejects.toMatchObject({
      code: 'IMAGE_SOURCE_UNSUPPORTED',
    });
    expect(await inspectImagePreviewRuntime({ heif: true })).toMatchObject({ ready: true });
  });
});

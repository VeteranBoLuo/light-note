import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFilePreviewChildEnv } from '../filePreview/runtime.js';
import { compressCardImage, imageError, validateSource } from './compress.js';

export const VIDEO_COVER_MAX_BYTES = 512 * 1024 * 1024;
const CHUNK_BYTES = 4 * 1024 * 1024;
const FORMATS = 'mov,matroska,webm,avi,asf,flv,ogg';
const binaries = () => ({
  probe: process.env.VIDEO_PREVIEW_FFPROBE_BIN || 'ffprobe',
  encoder: process.env.VIDEO_PREVIEW_FFMPEG_BIN || 'ffmpeg',
});

// Only controlled local bytes enter the decoder. No URL, storage credential or user filename reaches a child.
export async function readVideoCover(locator, metadata, readRange, { runner = promisify(execFile) } = {}) {
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > VIDEO_COVER_MAX_BYTES)
    throw imageError('IMAGE_VIDEO_SIZE_LIMIT');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-video-cover-'));
  const input = path.join(dir, 'source');
  const output = path.join(dir, 'frame.png');
  const deadline = Date.now() + 75_000;
  const sourceHash = createHash('sha256');
  const run = async (bin, args, timeout) => {
    const remaining = Math.min(timeout, deadline - Date.now());
    if (remaining <= 0) throw imageError('IMAGE_PROCESS_TIMEOUT');
    try {
      return await runner(bin, args, {
        timeout: remaining,
        killSignal: 'SIGKILL',
        maxBuffer: 128 * 1024,
        env: buildFilePreviewChildEnv(dir),
        windowsHide: true,
      });
    } catch (error) {
      if (error.code === 'ENOENT') throw imageError('IMAGE_RUNTIME_UNAVAILABLE');
      if (error.killed || error.code === 'ETIMEDOUT') throw imageError('IMAGE_PROCESS_TIMEOUT');
      if (/unknown encoder|error while loading shared libraries|library not loaded/i.test(String(error.stderr)))
        throw imageError('IMAGE_RUNTIME_UNAVAILABLE');
      throw imageError('IMAGE_VIDEO_DECODE_FAILED');
    }
  };
  try {
    const handle = await fs.open(input, 'wx', 0o600);
    try {
      const signal = AbortSignal.timeout(30_000);
      for (let start = 0; start < size; start += CHUNK_BYTES) {
        signal.throwIfAborted();
        const end = Math.min(size - 1, start + CHUNK_BYTES - 1);
        const chunk = await readRange(locator, start, end, { signal });
        signal.throwIfAborted();
        if (!Buffer.isBuffer(chunk) || chunk.length !== end - start + 1) throw imageError('IMAGE_SOURCE_CHANGED');
        sourceHash.update(chunk);
        await handle.writeFile(chunk);
      }
    } finally {
      await handle.close();
    }
    const { probe, encoder } = binaries();
    const { stdout } = await run(
      probe,
      [
        '-v',
        'error',
        '-max_alloc',
        '134217728',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        FORMATS,
        '-probesize',
        '8388608',
        '-analyzeduration',
        '5000000',
        '-threads',
        '1',
        '-max_pixels',
        '16777216',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,duration:format=duration',
        '-of',
        'json',
        input,
      ],
      10_000,
    );
    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      throw imageError('IMAGE_VIDEO_DECODE_FAILED');
    }
    const stream = info.streams?.[0];
    const pixels = Number(stream?.width) * Number(stream?.height);
    if (!(pixels > 0)) throw imageError('IMAGE_VIDEO_DECODE_FAILED');
    if (pixels > 4096 * 4096) throw imageError('IMAGE_VIDEO_RESOURCE_LIMIT');
    const duration = Number(info.format?.duration || stream.duration);
    const durationSeconds = Number.isFinite(duration) && duration > 0 ? duration : null;
    // Skip the opening instant and choose a representative frame from a small, scaled batch.
    const seek = durationSeconds ? Math.min(1, durationSeconds * 0.1) : 0;
    await run(
      encoder,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-max_alloc',
        '134217728',
        '-threads',
        '1',
        '-filter_threads',
        '1',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        FORMATS,
        '-probesize',
        '8388608',
        '-analyzeduration',
        '5000000',
        '-max_pixels',
        '16777216',
        '-ss',
        String(seek),
        '-i',
        input,
        '-map',
        '0:v:0',
        '-an',
        '-sn',
        '-dn',
        '-vf',
        "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease,thumbnail=12",
        '-frames:v',
        '1',
        '-c:v',
        'png',
        '-threads',
        '1',
        '-fs',
        String(4 * 1024 * 1024 + 1),
        output,
      ],
      30_000,
    );
    const stat = await fs.stat(output).catch(() => {
      throw imageError('IMAGE_VIDEO_DECODE_FAILED');
    });
    if (!stat.size || stat.size > 4 * 1024 * 1024) throw imageError('IMAGE_VIDEO_RESOURCE_LIMIT');
    const preview = await compressCardImage(await fs.readFile(output), {
      budgetMs: Math.min(15000, deadline - Date.now()),
      cropLongImage: false,
    });
    const body = preview.body;
    return {
      body,
      preview: { ...preview, presentation: 'full' },
      durationSeconds,
      revision: sourceHash.digest('hex'),
      version: metadata.version,
      sourceSize: size,
    };
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw imageError('IMAGE_PROCESS_TIMEOUT');
    throw error;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function inspectVideoPreviewRuntime({ runner = promisify(execFile) } = {}) {
  const { probe, encoder } = binaries();
  try {
    const options = { timeout: 5000, maxBuffer: 256 * 1024, env: buildFilePreviewChildEnv(os.tmpdir()) };
    await runner(probe, ['-version'], options);
    const { stdout } = await runner(
      encoder,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=size=16x16',
        '-frames:v',
        '1',
        '-c:v',
        'png',
        '-f',
        'image2pipe',
        'pipe:1',
      ],
      { ...options, encoding: 'buffer' },
    );
    validateSource(Buffer.from(stdout));
    return { ready: true, errorCode: null };
  } catch {
    return { ready: false, errorCode: 'IMAGE_RUNTIME_UNAVAILABLE' };
  }
}

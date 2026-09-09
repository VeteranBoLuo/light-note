import { makeProbePng } from '../util/imagePreview/probeImage.js';
// Standalone: no database, Redis, OBS, user files or credentials.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compressCardImage, validatePreview } from '../util/imagePreview/compress.js';
import { buildFilePreviewChildEnv } from '../util/filePreview/runtime.js';
const exec = promisify(execFile);
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-preview-probe-'));
let peakRss = 0;
let peakDisk = 0;
async function diskBytes(root) {
  let bytes = 0;
  for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) bytes += await diskBytes(file);
    else {
      const stat = await fs.stat(file).catch(() => null);
      bytes += stat ? stat.blocks * 512 : 0;
    }
  }
  return bytes;
}
const runner = async (bin, args, options) => {
  const monitor = setInterval(async () => {
    peakDisk = Math.max(peakDisk, await diskBytes(options.env.TMPDIR));
  }, 100);
  try {
    const result = await exec('/usr/bin/time', [process.platform === 'darwin' ? '-l' : '-v', bin, ...args], options);
    const text = String(result.stderr);
    const rss =
      process.platform === 'darwin'
        ? Number(/(\d+)\s+maximum resident set size/.exec(text)?.[1])
        : Number(/Maximum resident set size \(kbytes\): (\d+)/.exec(text)?.[1]) * 1024;
    if (!Number.isFinite(rss) || rss <= 0) throw new Error('RESOURCE_MEASUREMENT_UNAVAILABLE');
    peakRss = Math.max(peakRss, rss);
    return result;
  } finally {
    clearInterval(monitor);
  }
};
try {
  for (const [size, format] of [
    ['8001x8000', 'png'],
    ['10000x10000', 'png'],
    ['10000x10000', 'jpg'],
    ['2000x34000', 'png'],
  ]) {
    const source = path.join(dir, `source.${format}`);
    const [width, height] = size.split('x').map(Number);
    const png = await makeProbePng(width, height);
    await fs.writeFile(source, png);
    if (format === 'jpg') {
      const pngPath = path.join(dir, 'jpeg-source.png');
      await fs.writeFile(pngPath, png);
      await exec('convert', [pngPath, '-quality', '85', source], {
        timeout: 60000,
        env: { ...buildFilePreviewChildEnv(dir), MAGICK_THREAD_LIMIT: '1' },
      });
    }
    peakRss = 0;
    peakDisk = 0;
    const started = Date.now();
    const result = await compressCardImage(await fs.readFile(source), { runner });
    validatePreview(result.body);
    const report = {
      size,
      format,
      elapsedMs: Date.now() - started,
      peakRssBytes: peakRss,
      sampledPeakDiskBytes: peakDisk,
      outputBytes: result.body.length,
      presentation: result.presentation,
    };
    console.log(JSON.stringify(report));
    if (peakRss > 512 * 1024 * 1024 || peakDisk > 2 * 1024 ** 3 || report.elapsedMs > 60000)
      throw new Error('IMAGE_RESOURCE_BUDGET_EXCEEDED');
    if (size === '2000x34000' && result.presentation !== 'long_top') throw new Error('LONG_IMAGE_CROP_FAILED');
  }
} catch (error) {
  console.error('Large-image probe failed:', /^[A-Z_]+$/.test(error.message) ? error.message : 'PROBE_FAILED');
  process.exitCode = 1;
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}

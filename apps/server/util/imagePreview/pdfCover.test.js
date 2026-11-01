import { describe, it, expect, vi, beforeAll } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readPdfCover, inspectPdfPreviewRuntime } from './pdfCover.js';
import { MAX_SOURCE_BYTES, validatePreview } from './compress.js';
import { imageFailure } from './errors.js';
import { cloudPreviewFormat, isPdfCoverFile } from '@lightnote/shared';
const exec = promisify(execFile);
const hasPdftoppm = (() => {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
let png;
beforeAll(async () => {
  png = (await exec('convert', ['-size', '8x12', 'xc:white', 'png:-'], { encoding: 'buffer' })).stdout;
});
function onePagePdf() {
  const content = '0.2 0.4 0.8 rg 20 700 300 60 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
function fixture({ size = 10, bytes } = {}) {
  let dir;
  const runner = vi.fn(async (_bin, args, options) => {
    dir = options.env.TMPDIR;
    expect(options.env.OBS_SK).toBeUndefined();
    expect(args.slice(0, 8)).toEqual(['-f', '1', '-l', '1', '-singlefile', '-png', '-scale-to', '720']);
    expect(options.timeout).toBeLessThanOrEqual(20000);
    await fs.writeFile(`${args.at(-1)}.png`, png);
    return { stdout: '' };
  });
  const read = vi.fn(async (_key, start, end, options) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return bytes ? bytes.subarray(start, end + 1) : Buffer.alloc(end - start + 1, 1);
  });
  return { runner, read, metadata: { size: bytes?.length ?? size, version: 'etag-version' }, dir: () => dir };
}
describe('bounded PDF first-page covers', () => {
  it('routes only PDF names to the PDF cover format', () => {
    expect(isPdfCoverFile('Report.PDF')).toBe(true);
    expect(isPdfCoverFile('pdf')).toBe(false);
    expect(isPdfCoverFile('notes.pdf.txt')).toBe(false);
    expect(cloudPreviewFormat('Report.pdf')).toBe('pdf-card');
    expect(cloudPreviewFormat('clip.mov')).toBe('video-card');
    expect(cloudPreviewFormat('photo.png')).toBe('card');
  });
  it('renders the first page from a private copy and hashes the original bytes', async () => {
    const f = fixture({ size: 4 * 1024 * 1024 + 7 });
    const result = await readPdfCover('controlled-key', f.metadata, f.read, { runner: f.runner });
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ sourceSize: f.metadata.size, version: 'etag-version' });
    expect(result.preview.presentation).toBe('full');
    expect(result.revision).toBe(createHash('sha256').update(Buffer.alloc(f.metadata.size, 1)).digest('hex'));
    expect(validatePreview(result.body).type).toBe('webp');
    await expect(fs.stat(f.dir())).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects oversized inputs before download as a permanent resource limit', async () => {
    const f = fixture({ size: MAX_SOURCE_BYTES + 1 });
    await expect(readPdfCover('key', f.metadata, f.read, { runner: f.runner })).rejects.toMatchObject({
      code: 'IMAGE_PDF_SIZE_LIMIT',
    });
    expect(f.read).not.toHaveBeenCalled();
    expect(imageFailure('IMAGE_PDF_SIZE_LIMIT')).toMatchObject({ failureKind: 'resource_limit', retryable: false });
  });
  it.each([
    [Object.assign(new Error('encrypted'), { code: 1 }), 'IMAGE_PDF_RENDER_FAILED', false],
    [Object.assign(new Error('killed'), { killed: true }), 'IMAGE_PROCESS_TIMEOUT', true],
    [Object.assign(new Error('missing'), { code: 'ENOENT' }), 'IMAGE_RUNTIME_UNAVAILABLE', true],
  ])('classifies renderer failures and removes the private copy', async (error, code, retryable) => {
    const f = fixture();
    f.runner.mockImplementationOnce(async (_bin, _args, options) => {
      f.runner.dirSeen = options.env.TMPDIR;
      throw error;
    });
    await expect(readPdfCover('key', f.metadata, f.read, { runner: f.runner })).rejects.toMatchObject({ code });
    expect(imageFailure(code).retryable).toBe(retryable);
    await expect(fs.stat(f.runner.dirSeen)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('treats a renderer that writes no page as an unrenderable PDF', async () => {
    const f = fixture();
    f.runner.mockResolvedValueOnce({ stdout: '' });
    await expect(readPdfCover('key', f.metadata, f.read, { runner: f.runner })).rejects.toMatchObject({
      code: 'IMAGE_PDF_RENDER_FAILED',
    });
  });
  it.skipIf(!hasPdftoppm)('renders a real PDF page within the card bounds', async () => {
    const bytes = onePagePdf();
    const f = fixture({ bytes });
    const result = await readPdfCover('key', f.metadata, f.read);
    const size = validatePreview(result.body);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(720);
    expect(size.height).toBeGreaterThan(size.width);
    expect(await inspectPdfPreviewRuntime()).toEqual({ ready: true, errorCode: null });
  });
  it('reports an unavailable runtime without throwing', async () => {
    const runner = vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    expect(await inspectPdfPreviewRuntime({ runner })).toEqual({
      ready: false,
      errorCode: 'IMAGE_RUNTIME_UNAVAILABLE',
    });
  });
});

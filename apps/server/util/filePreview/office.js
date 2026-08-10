import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildFilePreviewChildEnv } from './runtime.js';

const execFileAsync = promisify(execFile);
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function previewError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function startsWithBytes(buffer, bytes) {
  return bytes.every((value, index) => buffer[index] === value);
}

export function validateConvertibleOfficeSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw previewError('FILE_CONTENT_INVALID');
  const normalized = String(extension || '').toLowerCase();
  if (['doc', 'xls', 'ppt'].includes(normalized) && !startsWithBytes(buffer, OLE_SIGNATURE)) {
    throw previewError('FILE_CONTENT_INVALID');
  }
  if (normalized === 'rtf' && !/^\s*\{\\rtf/iu.test(buffer.subarray(0, 64).toString('latin1'))) {
    throw previewError('FILE_CONTENT_INVALID');
  }
  if (['odt', 'ods', 'odp'].includes(normalized) && !startsWithBytes(buffer, [0x50, 0x4b])) {
    throw previewError('FILE_CONTENT_INVALID');
  }
}

function mapOfficeExecutionError(error) {
  if (error?.killed || error?.signal) return previewError('OFFICE_CONVERSION_TIMEOUT');
  return previewError('OFFICE_CONVERSION_FAILED');
}

export function getOfficePdfExportFilter(extension) {
  const normalized = String(extension || '').toLowerCase();
  if (['doc', 'rtf', 'odt'].includes(normalized)) return 'pdf:writer_pdf_Export';
  if (['xls', 'ods'].includes(normalized)) return 'pdf:calc_pdf_Export';
  if (['ppt', 'odp'].includes(normalized)) return 'pdf:impress_pdf_Export';
  throw previewError('FILE_CONTENT_INVALID');
}

export async function convertOfficeToPdf({ buffer, extension, bin, limits, runner = execFileAsync }) {
  validateConvertibleOfficeSignature(buffer, extension);
  const exportFilter = getOfficePdfExportFilter(extension);
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'light-note-preview-'));
  const inputDirectory = path.join(temporaryDirectory, 'input');
  const outputDirectory = path.join(temporaryDirectory, 'output');
  const profileDirectory = path.join(temporaryDirectory, 'profile');
  const safeExtension = String(extension || '').replace(/[^a-z0-9]/giu, '');
  if (!safeExtension) throw previewError('FILE_CONTENT_INVALID');
  const inputPath = path.join(inputDirectory, `source.${safeExtension}`);
  const outputPath = path.join(outputDirectory, 'source.pdf');
  try {
    await Promise.all([
      fs.mkdir(inputDirectory, { recursive: true, mode: 0o700 }),
      fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 }),
      fs.mkdir(profileDirectory, { recursive: true, mode: 0o700 }),
    ]);
    await fs.writeFile(inputPath, buffer, { mode: 0o600 });
    try {
      await runner(
        bin,
        [
          '--headless',
          '--nologo',
          '--nodefault',
          '--nolockcheck',
          '--norestore',
          `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
          '--convert-to',
          exportFilter,
          '--outdir',
          outputDirectory,
          inputPath,
        ],
        {
          timeout: limits.officeTimeoutMs,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          encoding: 'utf8',
          env: buildFilePreviewChildEnv(temporaryDirectory),
        },
      );
    } catch (error) {
      throw mapOfficeExecutionError(error);
    }
    let pdf;
    try {
      pdf = await fs.readFile(outputPath);
    } catch {
      throw previewError('OFFICE_CONVERSION_FAILED');
    }
    if (!startsWithBytes(pdf, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw previewError('OFFICE_OUTPUT_INVALID');
    if (pdf.length <= 0 || pdf.length > limits.convertedPdfMaxBytes) throw previewError('OFFICE_OUTPUT_TOO_LARGE');
    return pdf;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildFilePreviewChildEnv } from './runtime.js';

const execFileAsync = promisify(execFile);
const MAX_SAFE_SIZE = Number.MAX_SAFE_INTEGER;

function previewError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function startsWithBytes(buffer, bytes) {
  return bytes.every((value, index) => buffer[index] === value);
}

function hasValidTarHeader(buffer) {
  if (buffer.length < 512) return false;
  const checksumText = buffer
    .subarray(148, 156)
    .toString('ascii')
    .replace(/\0.*$/u, '')
    .trim();
  if (!/^[0-7]+$/u.test(checksumText)) return false;
  let checksum = 0;
  for (let index = 0; index < 512; index += 1) {
    checksum += index >= 148 && index < 156 ? 0x20 : buffer[index];
  }
  return checksum === Number.parseInt(checksumText, 8);
}

export function validateArchiveSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) throw previewError('FILE_CONTENT_INVALID');
  const normalized = String(extension || '').toLowerCase();
  const valid =
    (['zip', 'zipx'].includes(normalized) && startsWithBytes(buffer, [0x50, 0x4b])) ||
    (normalized === 'rar' && startsWithBytes(buffer, [0x52, 0x61, 0x72, 0x21])) ||
    (normalized === '7z' && startsWithBytes(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) ||
    (['gz', 'tgz', 'tar.gz'].includes(normalized) && startsWithBytes(buffer, [0x1f, 0x8b])) ||
    (['bz2', 'tbz', 'tbz2', 'tar.bz2'].includes(normalized) && startsWithBytes(buffer, [0x42, 0x5a, 0x68])) ||
    (['xz', 'txz', 'tar.xz'].includes(normalized) && startsWithBytes(buffer, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) ||
    (normalized === 'tar' && hasValidTarHeader(buffer));
  if (!valid) throw previewError('FILE_CONTENT_INVALID');
}

function normalizeArchivePath(value, maxLength) {
  const original = String(value || '');
  if (/^(?:[\\/]|[A-Za-z]:[\\/])/u.test(original)) return '';
  const raw = original.replace(/\\/gu, '/').replace(/^\.\//u, '');
  if (!raw || raw.length > maxLength || /[\u0000-\u001f\u007f]/u.test(raw)) return '';
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return '';
  return parts.join('/');
}

function numberField(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(MAX_SAFE_SIZE, Math.trunc(parsed));
}

export function parseSevenZipListing(output, limits) {
  const blocks = String(output || '').split(/\r?\n\s*\r?\n/u);
  const entries = [];
  let skippedUnsafeEntries = 0;
  let processedEntries = 0;
  let totalUncompressedSize = 0;
  let totalPackedSize = 0;
  for (const block of blocks) {
    const fields = {};
    for (const line of block.split(/\r?\n/u)) {
      const separator = line.indexOf(' = ');
      if (separator <= 0) continue;
      fields[line.slice(0, separator).trim()] = line.slice(separator + 3);
    }
    if (!fields.Path || (fields.Type && fields.Size == null && fields.Folder == null)) continue;
    processedEntries += 1;
    if (processedEntries > limits.archiveMaxEntries) throw previewError('ARCHIVE_ENTRY_LIMIT_EXCEEDED');
    const normalizedPath = normalizeArchivePath(fields.Path, limits.archiveMaxPathLength);
    if (!normalizedPath) {
      skippedUnsafeEntries += 1;
      continue;
    }
    const isDirectory = fields.Folder === '+' || /^D/u.test(String(fields.Attributes || ''));
    const size = isDirectory ? 0 : numberField(fields.Size);
    const packedSize = isDirectory ? 0 : numberField(fields['Packed Size']);
    const pathParts = normalizedPath.split('/');
    entries.push({
      path: normalizedPath,
      name: pathParts[pathParts.length - 1],
      parentPath: pathParts.slice(0, -1).join('/'),
      isDirectory,
      size,
      packedSize,
      modifiedAt: String(fields.Modified || '').slice(0, 32),
      encrypted: fields.Encrypted === '+',
    });
    totalUncompressedSize = Math.min(MAX_SAFE_SIZE, totalUncompressedSize + size);
    totalPackedSize = Math.min(MAX_SAFE_SIZE, totalPackedSize + packedSize);
  }
  if (!entries.length) throw previewError('ARCHIVE_EMPTY_OR_UNREADABLE');
  const suspiciousExpansion =
    totalUncompressedSize > 10 * 1024 * 1024 * 1024 ||
    (totalPackedSize > 0 && totalUncompressedSize / totalPackedSize > 1000);
  return {
    version: 1,
    entries,
    entryCount: entries.length,
    totalUncompressedSize,
    containsEncrypted: entries.some((entry) => entry.encrypted),
    suspiciousExpansion,
    skippedUnsafeEntries,
  };
}

function mapArchiveExecutionError(error) {
  const detail = `${String(error?.stdout || '')}\n${String(error?.stderr || '')}`;
  if (/wrong password|password is incorrect|encrypted archive/i.test(detail)) {
    return previewError('ARCHIVE_PASSWORD_REQUIRED');
  }
  if (/missing volume|unexpected end of archive|data error/i.test(detail)) {
    return previewError('ARCHIVE_MULTIPART_OR_DAMAGED');
  }
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return previewError('ARCHIVE_MANIFEST_TOO_LARGE');
  if (error?.killed || error?.signal) return previewError('ARCHIVE_PREVIEW_TIMEOUT');
  return previewError('ARCHIVE_LIST_FAILED');
}

export async function createArchiveManifest({ buffer, extension, bin, limits, runner = execFileAsync }) {
  validateArchiveSignature(buffer, extension);
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'light-note-preview-'));
  const safeExtension = String(extension || 'archive').replace(/[^a-z0-9.]/giu, '') || 'archive';
  const inputPath = path.join(temporaryDirectory, `source.${safeExtension}`);
  try {
    await fs.writeFile(inputPath, buffer, { mode: 0o600 });
    let stdout;
    try {
      const result = await runner(
        bin,
        ['l', '-slt', '-ba', '-sccUTF-8', '-y', '-p__LIGHT_NOTE_NO_PASSWORD__', '--', inputPath],
        {
          timeout: limits.archiveTimeoutMs,
          maxBuffer: limits.archiveMaxListingBytes,
          windowsHide: true,
          encoding: 'utf8',
          env: buildFilePreviewChildEnv(temporaryDirectory),
        },
      );
      stdout = result.stdout;
    } catch (error) {
      throw mapArchiveExecutionError(error);
    }
    const manifest = parseSevenZipListing(stdout, limits);
    const serialized = JSON.stringify(manifest);
    if (Buffer.byteLength(serialized, 'utf8') > limits.archiveMaxManifestBytes) {
      throw previewError('ARCHIVE_MANIFEST_TOO_LARGE');
    }
    return { manifest, serialized };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function normalizeRequestedPath(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/gu, '/')
    .replace(/^\/+|\/+$/gu, '');
  if (!normalized) return '';
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || /[\u0000-\u001f\u007f]/u.test(part))) {
    throw previewError('ARCHIVE_PATH_INVALID');
  }
  return parts.join('/');
}

export function buildArchiveDirectoryPage(manifest, { directory = '', query = '', offset = 0, limit = 200 } = {}) {
  const currentPath = normalizeRequestedPath(directory);
  const keyword = String(query || '')
    .trim()
    .toLocaleLowerCase()
    .slice(0, 100);
  const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0));
  const safeLimit = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 200)));
  let items;
  if (keyword) {
    items = manifest.entries
      .filter((entry) => entry.path.toLocaleLowerCase().includes(keyword))
      .map((entry) => ({ ...entry }));
  } else {
    const prefix = currentPath ? `${currentPath}/` : '';
    const children = new Map();
    for (const entry of manifest.entries) {
      if (prefix && !entry.path.startsWith(prefix)) continue;
      const relative = prefix ? entry.path.slice(prefix.length) : entry.path;
      if (!relative) continue;
      const [name, ...rest] = relative.split('/');
      const childPath = currentPath ? `${currentPath}/${name}` : name;
      if (rest.length) {
        if (!children.has(childPath)) {
          children.set(childPath, {
            path: childPath,
            name,
            parentPath: currentPath,
            isDirectory: true,
            size: 0,
            packedSize: 0,
            modifiedAt: '',
            encrypted: false,
          });
        }
        continue;
      }
      children.set(childPath, { ...entry });
    }
    items = [...children.values()];
  }
  items.sort(
    (left, right) =>
      Number(right.isDirectory) - Number(left.isDirectory) ||
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }),
  );
  const page = items.slice(safeOffset, safeOffset + safeLimit);
  return {
    directory: currentPath,
    query: keyword,
    items: page,
    total: items.length,
    nextOffset: safeOffset + page.length < items.length ? safeOffset + page.length : null,
  };
}

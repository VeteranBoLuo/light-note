import { readAudioCover } from './audioCover.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NOTE_IMAGE_DIR } from '../noteImages.js';
import {
  getObjectMetadataFromObs,
  getObjectBufferFromObs,
  getObjectRangeFromObs,
  deleteObjectFromObs,
} from '../obsClient.js';
import { MAX_SOURCE_BYTES, imageError } from './compress.js';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function localImageLocator(url) {
  try {
    const u = new URL(url, String(url).startsWith('/uploads/') ? 'https://boluo66.top' : undefined);
    if (!['http:', 'https:'].includes(u.protocol) || u.hostname !== 'boluo66.top') return '';
    const decoded = decodeURIComponent(u.pathname);
    const name = path.basename(decoded);
    if (decoded !== `/uploads/${name}` || /[\x00\[\]\\]/u.test(name)) return '';
    return name;
  } catch {
    return '';
  }
}
export function localSourcePath(locator) {
  if (!locator || path.basename(locator) !== locator || /[\x00\[\]\\]/u.test(locator))
    throw imageError('IMAGE_SOURCE_INVALID');
  return path.join(NOTE_IMAGE_DIR, locator);
}
export const storageAdapters = Object.freeze({
  local: {
    async metadata(locator) {
      const s = await fs.stat(localSourcePath(locator));
      if (!s.isFile()) throw imageError('IMAGE_SOURCE_INVALID');
      return { size: s.size, modifiedAt: s.mtimeMs, version: hash(`${s.size}:${s.mtimeMs}`) };
    },
    async read(locator) {
      const handle = await fs.open(localSourcePath(locator), 'r');
      try {
        const stat = await handle.stat();
        if (stat.size > MAX_SOURCE_BYTES) throw imageError('IMAGE_SOURCE_SIZE_LIMIT');
        const bytes = Buffer.alloc(stat.size + 1);
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        if (offset !== stat.size) throw imageError('IMAGE_SOURCE_CHANGED');
        return bytes.subarray(0, offset);
      } finally {
        await handle.close();
      }
    },
    async remove(locator) {
      await fs.unlink(localSourcePath(locator)).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    },
  },
  obs: {
    async metadata(locator) {
      const m = await getObjectMetadataFromObs(locator);
      return { size: m.contentLength, version: hash(m.etag) };
    },
    async read(locator) {
      return getObjectBufferFromObs(locator, { maxBytes: MAX_SOURCE_BYTES });
    },
    async remove(locator) {
      await deleteObjectFromObs(locator);
    },
  },
});
export async function readSource(asset) {
  const adapter = storageAdapters[asset.storage_kind];
  if (!adapter) throw imageError('IMAGE_SOURCE_INVALID');
  const meta = await adapter.metadata(asset.source_locator);
  if (asset.source_type === 'cloud_file' && /\.mp3$/i.test(asset.source_file_name || '')) {
    const { body, tag } = await readAudioCover(asset.source_locator, Number(meta.size), getObjectRangeFromObs);
    return { body, noCover: !body, version: meta.version, sourceSize: Number(meta.size), revision: hash(tag) };
  }
  if (meta.size > MAX_SOURCE_BYTES) throw imageError('IMAGE_SOURCE_SIZE_LIMIT');
  const body = await adapter.read(asset.source_locator);
  if (body.length !== meta.size) throw imageError('IMAGE_SOURCE_CHANGED');
  return { body, version: meta.version, modifiedAt: meta.modifiedAt };
}

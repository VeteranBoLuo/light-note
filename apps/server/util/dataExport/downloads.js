import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import axios from 'axios';
import { validatePublicWebUrl, guardedHttpAgent, guardedHttpsAgent } from '../webUrlSafety.js';
import { buildObjectKey, createDownloadSignedUrl } from '../obsClient.js';
import { filterOwnedImageUrls, NOTE_IMAGE_DIR } from '../noteImages.js';
import { localImageLocator, localSourcePath } from '../imagePreview/sources.js';
import { exportError, ensureSpace } from './storage.js';
const IMAGE_LIMIT = 25 * 1024 * 1024;
export async function publicImageStream(source, signal, redirects = 0) {
  const url = validatePublicWebUrl(source, { defaultPortsOnly: true });
  const response = await axios.get(url.href, {
    responseType: 'stream',
    maxRedirects: 0,
    proxy: false,
    httpAgent: guardedHttpAgent,
    httpsAgent: guardedHttpsAgent,
    signal,
    timeout: 20000,
    validateStatus: () => true,
    headers: { Accept: 'image/*' },
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    response.data.destroy();
    if (redirects >= 4 || !response.headers.location) throw exportError('DATA_EXPORT_IMAGE_FAILED');
    return publicImageStream(new URL(response.headers.location, url).href, signal, redirects + 1);
  }
  if (response.status !== 200 || !/^image\//i.test(response.headers['content-type'] || '')) {
    response.data.destroy();
    throw exportError('DATA_EXPORT_IMAGE_FAILED');
  }
  return response.data;
}
async function signedStream(key, signal) {
  const { url } = createDownloadSignedUrl({ objectKey: key, expires: 600 });
  const res = await fetch(url, { redirect: 'error', signal });
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw exportError('DATA_EXPORT_SOURCE_MISSING');
  }
  return Readable.fromWeb(res.body);
}
export async function fileStream(row, signal) {
  if (row.obs_key) return signedStream(row.obs_key, signal);
  // Legacy local files: only registered resources below the existing upload root.
  const pathname = new URL(String(row.directory || '') + row.title, 'https://boluo66.top').pathname;
  if (!pathname.startsWith('/uploads/')) return signedStream(buildObjectKey(row.create_by, row.title), signal);
  const root = await fsp.realpath(NOTE_IMAGE_DIR),
    target = await fsp.realpath(path.resolve(root, decodeURIComponent(pathname.slice(9))));
  if (!target.startsWith(root + path.sep)) throw exportError('DATA_EXPORT_SOURCE_MISSING');
  return fs.createReadStream(target, { signal });
}
export async function copyFile(row, destination, signal) {
  const expected = Number(row.file_size);
  if (!Number.isSafeInteger(expected) || expected < 0) throw exportError('DATA_EXPORT_SOURCE_MISSING');
  await ensureSpace(expected * 2);
  await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  let count = 0;
  try {
    await pipeline(
      await fileStream(row, signal),
      new Transform({
        transform(chunk, encoding, cb) {
          count += chunk.length;
          cb(count > expected ? exportError('DATA_EXPORT_SOURCE_CHANGED') : null, chunk);
        },
      }),
      fs.createWriteStream(destination, { mode: 0o600 }),
      { signal },
    );
    if (count !== expected) throw exportError('DATA_EXPORT_SOURCE_CHANGED');
  } catch (e) {
    await fsp.rm(destination, { force: true });
    throw e;
  }
}
export async function imageBytes(source, owner, db, signal) {
  const u = new URL(source, 'https://boluo66.top');
  let stream;
  if (source.startsWith('data:')) {
    if (source.length > IMAGE_LIMIT * 1.4 || !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(source))
      throw exportError('DATA_EXPORT_IMAGE_FAILED');
    return Buffer.from(source.slice(source.indexOf(',') + 1), 'base64');
  }
  const locator = localImageLocator(source);
  if (locator) {
    const canonical = 'https://boluo66.top/uploads/' + locator;
    const owned = await filterOwnedImageUrls({ urls: [canonical], userId: owner, connection: db });
    if (!owned.length) throw exportError('DATA_EXPORT_IMAGE_DENIED');
    stream = fs.createReadStream(localSourcePath(locator), { signal });
  } else if (u.hostname === 'boluo66.top' && u.pathname.startsWith('/api/file/image/')) {
    const id = u.pathname.slice('/api/file/image/'.length);
    const [[row]] = await db.query('SELECT obs_key FROM files WHERE id=? AND create_by=? AND del_flag=0', [id, owner]);
    if (!row?.obs_key) throw exportError('DATA_EXPORT_IMAGE_DENIED');
    stream = await signedStream(row.obs_key, signal);
  } else {
    // Never fetch private app endpoints or raw signed storage URLs as public images.
    if (u.hostname === 'boluo66.top' || /[?&](?:signature|token|accesskeyid|x-amz-signature)=/i.test(u.search))
      throw exportError('DATA_EXPORT_IMAGE_DENIED');
    stream = await publicImageStream(u.href, signal);
  }
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > IMAGE_LIMIT) throw exportError('DATA_EXPORT_IMAGE_LIMIT');
      chunks.push(chunk);
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks, bytes);
}
export function imageExtension(b) {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return '.jpg';
  if (/^GIF8[79]a/.test(b.subarray(0, 6).toString())) return '.gif';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return '.webp';
  throw exportError('DATA_EXPORT_IMAGE_FAILED');
}

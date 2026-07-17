import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import redisClient from './redisClient.js';
import { NOTE_IMAGE_DIR } from './noteImages.js';
import { AI_DOCUMENT_MAX_BYTES } from './aiDocument/parser.js';
import { localOcrProvider } from './aiDocument/localOcr.js';

const CACHE_PREFIX = 'note:image-ocr:v1:';
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MEMORY_CACHE_LIMIT = 100;
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const memoryCache = new Map();
const inFlight = new Map();

function cacheKey(hash) {
  return `${CACHE_PREFIX}${hash}`;
}

function remember(hash, content) {
  memoryCache.delete(hash);
  memoryCache.set(hash, content);
  while (memoryCache.size > MEMORY_CACHE_LIMIT) memoryCache.delete(memoryCache.keys().next().value);
}

async function getCached(hash, cache = redisClient) {
  if (memoryCache.has(hash)) {
    const content = memoryCache.get(hash);
    remember(hash, content);
    return content;
  }
  try {
    const content = await cache.get(cacheKey(hash));
    if (content) {
      remember(hash, content);
      return content;
    }
  } catch {
    // Redis 不可用时仍可继续 OCR，内存缓存作为当前进程兜底。
  }
  return '';
}

async function setCached(hash, content, cache = redisClient) {
  remember(hash, content);
  try {
    await cache.setEx(cacheKey(hash), CACHE_TTL_SECONDS, content);
  } catch {
    // OCR 已成功，缓存写入失败不能反向导致本轮回答失败。
  }
}

export function resolveLocalNoteImage(url, imageRoot = NOTE_IMAGE_DIR) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'boluo66.top') return null;
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  const prefix = '/uploads/';
  if (!pathname.startsWith(prefix)) return null;
  const fileName = path.basename(pathname);
  if (!fileName || pathname !== `${prefix}${fileName}` || fileName.includes('\0')) return null;
  const extension = path.extname(fileName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) return null;
  return { fileName, extension, filePath: path.join(imageRoot, fileName) };
}

async function recognizeOne(
  image,
  {
    signal,
    imageRoot = NOTE_IMAGE_DIR,
    readImage = readFile,
    ocrProvider = localOcrProvider,
    cache = redisClient,
  } = {},
) {
  const local = resolveLocalNoteImage(image.url, imageRoot);
  if (!local) return { ...image, status: 'unsupported', content: '' };
  try {
    const buffer = await readImage(local.filePath);
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('EMPTY_IMAGE');
    if (buffer.length > AI_DOCUMENT_MAX_BYTES) throw new Error('IMAGE_TOO_LARGE');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const cached = await getCached(hash, cache);
    if (cached) return { ...image, status: 'success', content: cached, cached: true };

    let pending = inFlight.get(hash);
    if (!pending) {
      pending = (async () => {
        const result = await ocrProvider.recognizeImage(buffer, { extension: local.extension, signal });
        const content = String(result?.content || '').trim();
        if (!content) throw new Error('EMPTY_OCR_RESULT');
        await setCached(hash, content, cache);
        return content;
      })().finally(() => inFlight.delete(hash));
      inFlight.set(hash, pending);
    }
    return { ...image, status: 'success', content: await pending, cached: false };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return {
      ...image,
      status: 'failed',
      content: '',
      errorCode: String(error?.code || error?.message || 'OCR_FAILED'),
    };
  }
}

export async function recognizeNoteImages(
  images,
  {
    signal,
    limit = 2,
    allowedUrls,
    imageRoot = NOTE_IMAGE_DIR,
    readImage = readFile,
    ocrProvider = localOcrProvider,
    cache = redisClient,
  } = {},
) {
  const allowed = allowedUrls instanceof Set ? allowedUrls : new Set(Array.isArray(allowedUrls) ? allowedUrls : []);
  if (!allowed.size) return [];
  const candidates = [];
  const seen = new Set();
  for (const image of Array.isArray(images) ? images : []) {
    const url = String(image?.url || '');
    if (!url || seen.has(url) || !allowed.has(url)) continue;
    seen.add(url);
    candidates.push({ ...image, url });
    if (candidates.length >= Math.min(3, Math.max(1, Number(limit) || 2))) break;
  }

  const results = [];
  // 服务器资源有限，按顺序识别，避免同一请求同时启动多个 Tesseract 进程。
  for (const image of candidates) {
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
    results.push(await recognizeOne(image, { signal, imageRoot, readImage, ocrProvider, cache }));
  }
  return results;
}

export function clearNoteImageOcrMemoryCache() {
  memoryCache.clear();
  inFlight.clear();
}

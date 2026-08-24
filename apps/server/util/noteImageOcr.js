import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import redisClient from './redisClient.js';
import { NOTE_IMAGE_DIR } from './noteImages.js';
import { AI_DOCUMENT_MAX_BYTES } from './aiDocument/parser.js';
import {
  getImageRecognitionPolicy,
  imageRecognitionProvider,
  IMAGE_RECOGNITION_POLICY_VERSION,
} from './imageRecognition/service.js';

const CACHE_PREFIX = 'note:image-recognition:v2:';
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const FALLBACK_CACHE_TTL_SECONDS = 30 * 60;
const MEMORY_CACHE_LIMIT = 100;
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const memoryCache = new Map();
const inFlight = new Map();

function cacheKey(scope, hash) {
  const scopeDigest = crypto
    .createHash('sha256')
    .update(String(scope || 'note'))
    .digest('hex')
    .slice(0, 20);
  return `${CACHE_PREFIX}${scopeDigest}:${hash}`;
}

function remember(key, value, ttlSeconds = CACHE_TTL_SECONDS) {
  memoryCache.delete(key);
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, Number(ttlSeconds) || CACHE_TTL_SECONDS) * 1000,
  });
  while (memoryCache.size > MEMORY_CACHE_LIMIT) memoryCache.delete(memoryCache.keys().next().value);
}

async function getCached(key, cache = redisClient) {
  if (memoryCache.has(key)) {
    const entry = memoryCache.get(key);
    if (Number(entry?.expiresAt || 0) > Date.now()) {
      memoryCache.delete(key);
      memoryCache.set(key, entry);
      return entry.value;
    }
    memoryCache.delete(key);
  }
  try {
    const raw = await cache.get(key);
    if (raw) {
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        value = { content: String(raw), metadata: {} };
      }
      if (Number(value?.metadata?.policyVersion || 0) !== IMAGE_RECOGNITION_POLICY_VERSION) {
        return null;
      }
      remember(key, value, value?.metadata?.fallbackReason ? FALLBACK_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS);
      return value;
    }
  } catch {
    // Redis 不可用时仍可继续 OCR，内存缓存作为当前进程兜底。
  }
  return null;
}

async function setCached(key, value, cache = redisClient) {
  const fallback = Boolean(value?.metadata?.fallbackReason);
  const ttlSeconds = fallback ? FALLBACK_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;
  remember(key, value, ttlSeconds);
  try {
    await cache.setEx(key, ttlSeconds, JSON.stringify(value));
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

async function recognizeOne(image, options = {}) {
  const {
    signal,
    imageRoot = NOTE_IMAGE_DIR,
    readImage = readFile,
    ocrProvider,
    recognitionProvider = ocrProvider || imageRecognitionProvider,
    cache = redisClient,
    cacheScope = 'note-images',
  } = options;
  const local = resolveLocalNoteImage(image.url, imageRoot);
  if (!local) return { ...image, status: 'unsupported', content: '' };
  try {
    const buffer = await readImage(local.filePath);
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('EMPTY_IMAGE');
    if (buffer.length > AI_DOCUMENT_MAX_BYTES) throw new Error('IMAGE_TOO_LARGE');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const policy = getImageRecognitionPolicy();
    const key = cacheKey(
      `${cacheScope}:policy=${policy.version}:mode=${policy.mode}:model=${policy.visionModel}`,
      hash,
    );
    const cached = await getCached(key, cache);
    if (cached?.content) {
      return { ...image, status: 'success', content: cached.content, metadata: cached.metadata || {}, cached: true };
    }

    let pending = inFlight.get(key);
    if (!pending) {
      pending = (async () => {
        const result = await recognitionProvider.recognizeImage(buffer, { extension: local.extension, signal });
        const content = String(result?.content || '').trim();
        if (!content) throw new Error('EMPTY_OCR_RESULT');
        const value = {
          content,
          metadata: {
            ...(result?.metadata || {}),
            policyVersion: Number(result?.metadata?.policyVersion || IMAGE_RECOGNITION_POLICY_VERSION),
          },
        };
        await setCached(key, value, cache);
        return value;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    const value = await pending;
    return { ...image, status: 'success', content: value.content, metadata: value.metadata, cached: false };
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
    ocrProvider,
    recognitionProvider = ocrProvider || imageRecognitionProvider,
    cache = redisClient,
    cacheScope = 'note-images',
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
    results.push(
      await recognizeOne(image, {
        signal,
        imageRoot,
        readImage,
        recognitionProvider,
        cache,
        cacheScope,
      }),
    );
  }
  return results;
}

export function clearNoteImageOcrMemoryCache() {
  memoryCache.clear();
  inFlight.clear();
}

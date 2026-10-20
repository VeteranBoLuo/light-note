import { hasAndroidBridge, postAndroidMessage } from './androidBridge';
import { parseIncomingShareManifest, type IncomingShareManifest } from './incomingShare';
import type { ManagedCloudUploadSource } from '@/api/cloudFileUploadApi';

/**
 * Android 系统分享的原生通道。
 *
 * - 原生把分享内容复制到私有缓存，复制完成后派发 {@link ANDROID_SHARE_EVENT}；网页启动时也会主动查询，
 *   所以冷启动、登录跳转或页面刷新后都能继续处理同一次分享。
 * - 文件内容从同域固定路径 `/__native-share/{id}/{序号}` 读取，由原生拦截后流式返回，不经过服务器。
 * - 保存成功或用户关闭后调用 {@link completeAndroidShare} 清理暂存；旧版 App 不认识这些消息时，
 *   查询超时按 unsupported 处理，不影响其他功能。
 */
export const ANDROID_SHARE_EVENT = 'light-note:native-share';
const PEEK_TIMEOUT_MS = 1500;

export type AndroidSharePeek =
  { status: 'none' | 'preparing' | 'unsupported' } | { status: 'ready'; share: IncomingShareManifest };

declare global {
  interface Window {
    /** 原生 → 网页的待处理分享查询结果，由 peekAndroidShare 装上 */
    __lightNoteAndroidShareResult?: (raw: unknown) => void;
  }
}

const pendingPeeks = new Map<string, (result: AndroidSharePeek) => void>();
/** 已保存或已放弃的分享：原生删除暂存是异步的，期间再次查询到同一编号时不能重复弹出。 */
const settledShareIds = new Set<string>();
let peekHookInstalled = false;

function ensurePeekHook() {
  if (typeof window === 'undefined') return;
  if (peekHookInstalled && typeof window.__lightNoteAndroidShareResult === 'function') return;
  peekHookInstalled = true;
  window.__lightNoteAndroidShareResult = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const source = raw as Record<string, unknown>;
    const token = typeof source.token === 'string' ? source.token : '';
    const settle = pendingPeeks.get(token);
    if (!settle) return;
    pendingPeeks.delete(token);
    settle(normalizePeek(source));
  };
}

function normalizePeek(source: Record<string, unknown>): AndroidSharePeek {
  if (source.status === 'preparing') return { status: 'preparing' };
  if (source.status !== 'ready') return { status: 'none' };
  const share = parseIncomingShareManifest(source.share);
  if (!share || settledShareIds.has(share.id)) return { status: 'none' };
  return { status: 'ready', share };
}

export function peekAndroidShare(): Promise<AndroidSharePeek> {
  return new Promise((resolve) => {
    if (!hasAndroidBridge()) {
      resolve({ status: 'unsupported' });
      return;
    }
    ensurePeekHook();
    const token = `share-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const timeoutId = setTimeout(() => {
      pendingPeeks.delete(token);
      resolve({ status: 'unsupported' });
    }, PEEK_TIMEOUT_MS);
    pendingPeeks.set(token, (result) => {
      clearTimeout(timeoutId);
      resolve(result);
    });
    if (!postAndroidMessage({ type: 'share.peek', token })) {
      clearTimeout(timeoutId);
      pendingPeeks.delete(token);
      resolve({ status: 'unsupported' });
    }
  });
}

/** 保存成功或用户关闭后清理原生暂存；同一编号只处理一次。 */
export function completeAndroidShare(shareId: string) {
  if (!shareId || settledShareIds.has(shareId)) return;
  settledShareIds.add(shareId);
  postAndroidMessage({ type: 'share.complete', shareId });
}

/** 「完成」：把轻笺移到后台，从别的应用分享进来时用户会回到原来的应用。 */
export function finishAndroidShare(): boolean {
  return postAndroidMessage({ type: 'share.finish' });
}

export function onAndroidShareAvailable(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(ANDROID_SHARE_EVENT, listener);
  return () => window.removeEventListener(ANDROID_SHARE_EVENT, listener);
}

/** 清单阶段不读取文件；最多三个上传任务各自按需读取，失败后仍可从原生暂存重试。 */
export function createAndroidShareFiles(
  share: IncomingShareManifest,
  fetcher: typeof fetch = fetch,
): ManagedCloudUploadSource[] {
  return share.files.map((entry) => ({
    name: entry.name,
    size: entry.size,
    type: entry.mimeType,
    // 使用稳定索引区分同名同大小的不同分享文件。
    lastModified: entry.index,
    async read(signal?: AbortSignal) {
      try {
        if (signal?.aborted) throw new DOMException('Read cancelled', 'AbortError');
        const response = await fetcher(`/__native-share/${share.id}/${entry.index}`, {
          cache: 'no-store',
          credentials: 'omit',
          signal,
        });
        if (!response.ok) throw new Error('SHARE_FILE_UNAVAILABLE');
        const blob = await response.blob();
        if (signal?.aborted) throw new DOMException('Read cancelled', 'AbortError');
        if (blob.size !== entry.size) throw new Error('SHARE_FILE_SIZE_CHANGED');
        return new File([blob], entry.name, { type: entry.mimeType || blob.type, lastModified: entry.index });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw Object.assign(new Error('SHARE_FILE_UNREADABLE'), { code: 'SHARE_FILE_UNREADABLE' });
      }
    },
  }));
}

/** 仅供测试重置模块状态。 */
export function resetAndroidIncomingShareForTest() {
  pendingPeeks.clear();
  settledShareIds.clear();
  peekHookInstalled = false;
}

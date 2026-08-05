export interface LightNoteAndroidBridge {
  postMessage: (message: string) => void;
}

export type AndroidLegalDocument = 'privacy-policy.html' | 'user-agreement.html';

export type AndroidDownloadStatus = 'pending' | 'running' | 'paused' | 'success' | 'failed';

/** 原生 DownloadManager 的一次进度快照（由 WebViewSupport.progressPayload 生成） */
export interface AndroidDownloadProgress {
  /** DownloadManager 的 downloadId，同一次下载全程不变 */
  id: string;
  fileName: string;
  status: AndroidDownloadStatus;
  bytesDownloaded: number;
  /** -1 表示服务器没给 Content-Length，总量未知 */
  totalBytes: number;
  /** -1 表示进度未知（只能显示不确定态） */
  percent: number;
}

/** 图片保存结果。`unsupported` 覆盖旧版 App（没有这个通道，等不到回复）和系统版本过低两种情况。 */
export interface AndroidImageSaveResult {
  ok: boolean;
  reason?: 'unsupported' | 'failed';
}

declare global {
  interface Window {
    LightNoteAndroid?: LightNoteAndroidBridge;
    /** 原生 → 网页的下载进度回调，由 onAndroidDownloadProgress 装上 */
    __lightNoteAndroidDownloadProgress?: (raw: unknown) => void;
    /** 原生 → 网页的图片保存结果回调，由 saveImageViaAndroid 装上 */
    __lightNoteAndroidImageSaveResult?: (raw: unknown) => void;
  }
}

export function hasLightNoteAndroidUserAgent(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
) {
  return /\bLightNoteAndroid\/[\w.-]+/i.test(userAgent);
}

export function hasAndroidBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.LightNoteAndroid?.postMessage === 'function';
}

export function isLightNoteAndroidApp(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
) {
  return hasAndroidBridge() || hasLightNoteAndroidUserAgent(userAgent);
}

export function isAndroidWebViewRuntime(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
) {
  return (
    isLightNoteAndroidApp(userAgent) ||
    (/Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent))
  );
}

export function postAndroidMessage(payload: Record<string, unknown>): boolean {
  if (!hasAndroidBridge()) return false;

  try {
    window.LightNoteAndroid!.postMessage(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Android 原生通道不可用:', error);
    return false;
  }
}

const DOWNLOAD_STATUSES: AndroidDownloadStatus[] = ['pending', 'running', 'paused', 'success', 'failed'];

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 校验原生推来的进度快照。
 *
 * 原生和网页是各自发版的，字段缺失/改名要能被挡住而不是把 NaN 画到进度条上，
 * 所以这里逐字段兜底，形状不对就整条丢弃。
 */
export function normalizeAndroidDownloadProgress(raw: unknown): AndroidDownloadProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id : String(source.id ?? '');
  if (!id) return null;
  const status = DOWNLOAD_STATUSES.includes(source.status as AndroidDownloadStatus)
    ? (source.status as AndroidDownloadStatus)
    : 'running';
  const totalBytes = toFiniteNumber(source.totalBytes, -1);
  const bytesDownloaded = Math.max(0, toFiniteNumber(source.bytesDownloaded, 0));
  let percent = Math.round(toFiniteNumber(source.percent, -1));
  if (percent >= 0) percent = Math.min(100, percent);
  // 成功一定是 100%：服务器不给 Content-Length 时原生算不出百分比，但收口值是确定的
  if (status === 'success') percent = 100;
  return {
    id,
    fileName: typeof source.fileName === 'string' ? source.fileName : '',
    status,
    bytesDownloaded,
    totalBytes: totalBytes > 0 ? totalBytes : -1,
    percent,
  };
}

type AndroidDownloadProgressListener = (progress: AndroidDownloadProgress) => void;
const downloadProgressListeners = new Set<AndroidDownloadProgressListener>();
let downloadProgressHookInstalled = false;

function ensureDownloadProgressHook() {
  if (downloadProgressHookInstalled || typeof window === 'undefined') return;
  downloadProgressHookInstalled = true;
  window.__lightNoteAndroidDownloadProgress = (raw: unknown) => {
    const progress = normalizeAndroidDownloadProgress(raw);
    if (!progress) return;
    downloadProgressListeners.forEach((listener) => {
      try {
        listener(progress);
      } catch (error) {
        // 一个订阅者出错不该影响其它订阅者，也不该把异常抛回原生的 evaluateJavascript
        console.error('下载进度回调出错:', error);
      }
    });
  };
}

/**
 * 订阅原生下载进度。返回取消订阅函数。
 *
 * 进度按 DownloadManager 的 downloadId 标识，网页发起下载时拿不到这个 id，
 * 所以不做「发起 ↔ 进度」的握手：谁在下载都能收到，也就顺带覆盖了 WebView
 * 自身 DownloadListener 触发的下载（例如分享页里的下载链接）。
 */
export function onAndroidDownloadProgress(listener: AndroidDownloadProgressListener): () => void {
  ensureDownloadProgressHook();
  downloadProgressListeners.add(listener);
  return () => {
    downloadProgressListeners.delete(listener);
  };
}

/*
 * 图片保存（base64 直写）。
 *
 * 轻笺的头像本身就是 `data:image/jpeg;base64,...` 存在库里的，不是 http 地址，
 * 而 DownloadManager 只收 http(s)、WebView 对 data:/blob: 的 `<a download>` 又不触发下载，
 * 所以这类图片在 App 内两条常规路径都走不通，只能把字节交给原生自己写进相册。
 *
 * 用「请求带 token + 原生回传结果」而不是靠 UA 里的版本号判断能力：debug 与正式版
 * versionName 相同，版本号区分不出来；等不到回复就当旧版不支持，还能顺带拿到真实失败原因。
 */
const IMAGE_SAVE_TIMEOUT_MS = 8000;
const pendingImageSaves = new Map<string, (result: AndroidImageSaveResult) => void>();
let imageSaveHookInstalled = false;

function ensureImageSaveHook() {
  if (imageSaveHookInstalled || typeof window === 'undefined') return;
  imageSaveHookInstalled = true;
  window.__lightNoteAndroidImageSaveResult = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const source = raw as Record<string, unknown>;
    const token = typeof source.token === 'string' ? source.token : '';
    const settle = pendingImageSaves.get(token);
    if (!settle) return;
    pendingImageSaves.delete(token);
    settle({
      ok: source.ok === true,
      reason: source.ok === true ? undefined : source.reason === 'unsupported' ? 'unsupported' : 'failed',
    });
  };
}

export function saveImageViaAndroid(dataUrl: string, fileName: string): Promise<AndroidImageSaveResult> {
  return new Promise((resolve) => {
    if (!hasAndroidBridge()) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    ensureImageSaveHook();
    const token = `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let settled = false;
    const settle = (result: AndroidImageSaveResult) => {
      if (settled) return;
      settled = true;
      pendingImageSaves.delete(token);
      resolve(result);
    };
    pendingImageSaves.set(token, settle);
    // 旧版 App 收到未知消息类型会直接忽略，不会有任何回复 —— 超时即视为不支持
    setTimeout(() => settle({ ok: false, reason: 'unsupported' }), IMAGE_SAVE_TIMEOUT_MS);
    if (!postAndroidMessage({ type: 'image.save', token, dataUrl, fileName })) {
      settle({ ok: false, reason: 'unsupported' });
    }
  });
}

export function postAndroidAppReady(): boolean {
  return postAndroidMessage({ type: 'app.ready' });
}

export function postAndroidOpenLegalDocument(document: AndroidLegalDocument): boolean {
  return postAndroidMessage({ type: 'legal.open', document });
}

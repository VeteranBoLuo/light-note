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

/**
 * 安装已下载安装包的结果。
 * - `unsupported`：旧版 App 没有这个通道（等不到回复）
 * - `need_permission`：没授权「安装未知应用」，原生已顺手跳了设置页，开完要再点一次
 * - `not_found`：下载记录已不存在，或那个包不是从轻笺官网下载的
 */
export interface AndroidApkInstallResult {
  ok: boolean;
  reason?: 'unsupported' | 'need_permission' | 'not_found' | 'failed';
}

declare global {
  interface Window {
    LightNoteAndroid?: LightNoteAndroidBridge;
    /** 原生 → 网页的下载进度回调，由 onAndroidDownloadProgress 装上 */
    __lightNoteAndroidDownloadProgress?: (raw: unknown) => void;
    /** 原生 → 网页的图片保存结果回调，由 saveImageViaAndroid 装上 */
    __lightNoteAndroidImageSaveResult?: (raw: unknown) => void;
    /** 原生 → 网页的安装包安装结果回调，由 installApkViaAndroid 装上 */
    __lightNoteAndroidApkInstallResult?: (raw: unknown) => void;
    /** 原生 → 网页的系统深浅色变化回调，由 onAndroidSystemThemeChange 装上 */
    __lightNoteAndroidSystemTheme?: (raw: unknown) => void;
  }
}

export function hasLightNoteAndroidUserAgent(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /\bLightNoteAndroid\/[\w.-]+/i.test(userAgent);
}

/**
 * 从 UA 里取轻笺 App 的版本号（`LightNoteAndroid/1.0.1` → `1.0.1`）。
 * 版本由 WebViewSupport.configure 追加到 UA，取不到就是不在 App 内。
 *
 * 两处在用，理由都记在这里以免被当成冗余删掉：
 * - 应用内更新检查只能靠它。提示的服务对象恰恰是旧版本用户，若改用新增的原生桥消息去问
 *   版本号，现存装机永远收不到提示（要先装新包才有那个能力）。UA 里没有 versionCode，
 *   所以比较按 versionName 走语义化比较，见 composables/useAndroidAppUpdate.ts。
 * - 日志里带上它才能按版本定位问题 —— 同一个毛病往往只出现在某个 APK 版本上。
 */
export function getLightNoteAndroidVersion(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): string {
  const matched = /\bLightNoteAndroid\/([\w.-]+)/i.exec(userAgent);
  return matched ? matched[1] : '';
}

/**
 * 原生打在 UA 里的系统主题（`LightNoteSystemTheme/night|day`）。不在 App 内则返回 ''。
 *
 * 这是 App 内判断系统深浅色的唯一可信来源：WebView 的 `prefers-color-scheme` 只反映宿主主题的
 * isLightTheme，还会被旧 API 的 setForceDark 钉死，跟系统开关无关（鸿蒙兼容层实测恒为 light）。
 * 原生读的是框架层 uiMode，见 WindowInsetsSupport.isNightMode。
 *
 * 走 UA 而不是桥消息，是因为「跟随系统」要在首屏渲染前就定好主题 —— UA 是唯一在页面第一行
 * 脚本求值前就已经可用的通道。旧版 App 的 UA 里没有这个标记，调用方据此回退到媒体查询。
 */
export function getAndroidSystemTheme(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): 'night' | 'day' | '' {
  const matched = /\bLightNoteSystemTheme\/(night|day)\b/i.exec(userAgent);
  return matched ? (matched[1].toLowerCase() as 'night' | 'day') : '';
}

/** UA 是启动时的快照，运行中切换系统深色由原生 onConfigurationChanged 推过来。 */
type AndroidSystemThemeListener = (theme: 'night' | 'day') => void;
const systemThemeListeners = new Set<AndroidSystemThemeListener>();
let systemThemeHookInstalled = false;

function ensureSystemThemeHook() {
  if (systemThemeHookInstalled || typeof window === 'undefined') return;
  systemThemeHookInstalled = true;
  window.__lightNoteAndroidSystemTheme = (raw: unknown) => {
    const theme = raw === 'night' ? 'night' : raw === 'day' ? 'day' : '';
    if (!theme) return;
    systemThemeListeners.forEach((listener) => {
      try {
        listener(theme);
      } catch (error) {
        // 一个订阅者出错不该影响其它订阅者，也不该把异常抛回原生的 evaluateJavascript
        console.error('系统主题回调出错:', error);
      }
    });
  };
}

/** 订阅原生推来的系统主题变化，返回取消订阅函数。 */
export function onAndroidSystemThemeChange(listener: AndroidSystemThemeListener): () => void {
  ensureSystemThemeHook();
  systemThemeListeners.add(listener);
  return () => {
    systemThemeListeners.delete(listener);
  };
}

export function hasAndroidBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.LightNoteAndroid?.postMessage === 'function';
}

export function isLightNoteAndroidApp(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return hasAndroidBridge() || hasLightNoteAndroidUserAgent(userAgent);
}

export function isAndroidWebViewRuntime(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return isLightNoteAndroidApp(userAgent) || (/Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent));
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

/*
 * 应用内更新的安装环节。
 *
 * 下载完成后由原生把安装包交给系统安装器，省掉「自己去文件管理里翻」这一步 —— 在鸿蒙
 * 兼容层上这一步尤其难走：既不弹系统下载通知，文件也不落在「下载」目录。
 *
 * 同样用「请求带 token + 原生回传结果」而不是靠 UA 版本号判断能力：旧版 App 不认识
 * apk.install，收到后直接忽略、不会有任何回复，超时即视为不支持并降级回手动安装引导。
 */
const APK_INSTALL_TIMEOUT_MS = 8000;
const pendingApkInstalls = new Map<string, (result: AndroidApkInstallResult) => void>();
let apkInstallHookInstalled = false;

function ensureApkInstallHook() {
  if (apkInstallHookInstalled || typeof window === 'undefined') return;
  apkInstallHookInstalled = true;
  window.__lightNoteAndroidApkInstallResult = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const source = raw as Record<string, unknown>;
    const token = typeof source.token === 'string' ? source.token : '';
    const settle = pendingApkInstalls.get(token);
    if (!settle) return;
    pendingApkInstalls.delete(token);
    settle({
      ok: source.ok === true,
      reason: source.ok === true ? undefined : normalizeApkInstallReason(source.reason),
    });
  };
}

function normalizeApkInstallReason(value: unknown): AndroidApkInstallResult['reason'] {
  return value === 'need_permission' || value === 'not_found' || value === 'unsupported' ? value : 'failed';
}

/**
 * 请求原生安装已下载好的安装包。
 * `ok` 只表示系统安装确认页已被拉起 —— 装不装由用户在系统界面上决定，网页无从得知结果。
 */
export function installApkViaAndroid(downloadId: string): Promise<AndroidApkInstallResult> {
  return new Promise((resolve) => {
    if (!hasAndroidBridge()) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    ensureApkInstallHook();
    const token = `apk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let settled = false;
    const settle = (result: AndroidApkInstallResult) => {
      if (settled) return;
      settled = true;
      pendingApkInstalls.delete(token);
      resolve(result);
    };
    pendingApkInstalls.set(token, settle);
    setTimeout(() => settle({ ok: false, reason: 'unsupported' }), APK_INSTALL_TIMEOUT_MS);
    if (!postAndroidMessage({ type: 'apk.install', token, downloadId: String(downloadId) })) {
      settle({ ok: false, reason: 'unsupported' });
    }
  });
}

export function postAndroidAppReady(): boolean {
  return postAndroidMessage({ type: 'app.ready' });
}

/** 登录响应完成后要求原生 WebView 立即把最新 httpOnly Cookie 刷入持久存储。 */
export function persistAndroidAuthSession(): boolean {
  return postAndroidMessage({ type: 'auth.session.persist' });
}

export function postAndroidOpenLegalDocument(document: AndroidLegalDocument): boolean {
  return postAndroidMessage({ type: 'legal.open', document });
}

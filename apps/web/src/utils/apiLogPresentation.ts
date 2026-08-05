export type ApiLogRuntime = 'browser' | 'pwa-standalone' | 'android-app' | 'unknown';

const RUNTIME_LABEL_KEYS: Record<ApiLogRuntime, string> = {
  browser: 'apiLog.runtimeValues.browser',
  'pwa-standalone': 'apiLog.runtimeValues.pwa',
  'android-app': 'apiLog.runtimeValues.androidApp',
  unknown: 'apiLog.runtimeValues.unknown',
};

export function getApiLogRuntimeLabelKey(runtime?: string): string {
  return RUNTIME_LABEL_KEYS[runtime as ApiLogRuntime] || RUNTIME_LABEL_KEYS.unknown;
}

/**
 * 运行环境后面要不要缀 App 版本号。
 *
 * 只有 Android App 有版本号（浏览器/PWA 说「版本」没有意义），拿它是为了按 APK 版本定位问题 ——
 * 同一个毛病往往只出现在某个版本上，日志里不写清楚就只能靠猜。
 * 返回后缀而不是整段文案，是为了让调用方各自用自己的 t() 取标签，避免把 i18n 实例传进来。
 */
export function getApiLogAppVersionSuffix(runtime?: string, appVersion?: string): string {
  if (runtime !== 'android-app') return '';
  const version = String(appVersion || '').trim();
  return version ? ` ${version}` : '';
}

export function getApiLogRuntimeColor(runtime?: string): string {
  if (runtime === 'pwa-standalone') return 'var(--primary-color)';
  if (runtime === 'android-app') return 'var(--primary-h-color)';
  return 'var(--desc-color)';
}

export function getApiLogOsColor(os?: string): string {
  if (!os) return 'var(--desc-color)';
  if (os.includes('Windows') || os.includes('iOS') || os.includes('iPhone') || os.includes('iPad')) {
    return 'var(--primary-h-color)';
  }
  if (os.includes('macOS')) return 'var(--primary-color)';
  if (os.includes('Android') || os.includes('HarmonyOS') || os.includes('Harmony') || os.includes('鸿蒙')) {
    return 'var(--primary-text)';
  }
  if (os.includes('Linux') || os.includes('Ubuntu')) return 'var(--require-tip-color)';
  return 'var(--desc-color)';
}

export const API_LOG_RUNTIME = Object.freeze({
  browser: 'browser',
  pwa: 'pwa-standalone',
  androidApp: 'android-app',
  unknown: 'unknown',
});

const LEGACY_APP_SUFFIX = /\s*(?:(?:\(|（)\s*app\s*(?:\)|）)|app)\s*$/i;

function headerText(value, fallback = '') {
  const firstValue = Array.isArray(value) ? value[0] : value;
  const text = String(firstValue ?? '').trim();
  return text || fallback;
}

function canonicalizeOsName(value) {
  const os = headerText(value, '未知');
  const key = os.replace(/\s+/g, ' ').toLowerCase();
  const canonicalNames = {
    ios: 'iOS',
    ipados: 'iPadOS',
    macos: 'macOS',
    'mac os': 'macOS',
    'mac os x': 'macOS',
    android: 'Android',
    harmonyos: 'HarmonyOS',
    linux: 'Linux',
    unix: 'UNIX',
  };
  return canonicalNames[key] || os;
}

export function normalizeApiLogRuntime(value) {
  const runtime = headerText(value).toLowerCase();
  if (runtime === 'browser' || runtime === 'web') return API_LOG_RUNTIME.browser;
  if (['pwa', 'pwa-standalone', 'standalone', 'web-app'].includes(runtime)) return API_LOG_RUNTIME.pwa;
  if (['android', 'android-app', 'apk'].includes(runtime)) return API_LOG_RUNTIME.androidApp;
  return API_LOG_RUNTIME.unknown;
}

/**
 * 新日志把操作系统与运行环境分开保存；读取历史日志时兼容 iOSapp、iOS(app)、iOS（app）等旧格式。
 */
export function normalizeApiLogSystem(value) {
  const system = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawOs = headerText(system.os, '未知');
  const legacyPwa = LEGACY_APP_SUFFIX.test(rawOs);
  const os = canonicalizeOsName(rawOs.replace(LEGACY_APP_SUFFIX, '').trim() || '未知');
  const rawRuntime = headerText(system.runtime);
  const normalizedRuntime = normalizeApiLogRuntime(rawRuntime);
  const runtime =
    normalizedRuntime !== API_LOG_RUNTIME.unknown
      ? normalizedRuntime
      : legacyPwa
        ? API_LOG_RUNTIME.pwa
        : rawRuntime
          ? API_LOG_RUNTIME.unknown
          : API_LOG_RUNTIME.browser;

  return {
    ...system,
    browser: headerText(system.browser, '未知'),
    os,
    runtime,
  };
}

export function buildApiLogSystem(req, extra = {}) {
  return normalizeApiLogSystem({
    browser: req?.headers?.browser,
    os: req?.headers?.os,
    runtime: req?.headers?.['x-lightnote-runtime'],
    ...extra,
  });
}

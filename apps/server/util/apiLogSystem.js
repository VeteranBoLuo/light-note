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
 * App 版本号（`1.0.1`）。只保留数字、点和短横，挡住 UA 伪造塞进来的长串或奇怪字符 ——
 * 这个值会直接显示在后台日志里，不能让它变成注入点或把列撑爆。
 */
export function normalizeAppVersion(value) {
  const version = headerText(value);
  if (!version) return '';
  return /^[\w.-]{1,32}$/.test(version) ? version : '';
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

  const appVersion = normalizeAppVersion(system.appVersion);
  // 必须先把原始 appVersion 摘出去再展开：否则 `...system` 会把没通过校验的原值
  // （伪造的超长串、带引号的注入尝试）原样带进结果，上面的校验就白做了；
  // 请求头缺失时它还会留下一个值为 undefined 的键，让「非 App 环境无此字段」不成立。
  const { appVersion: _rawAppVersion, ...restSystem } = system;

  return {
    ...restSystem,
    browser: headerText(system.browser, '未知'),
    os,
    runtime,
    // 只有 App 内才有版本号；非 App 环境不留空字段，免得历史日志多出一堆空值
    ...(appVersion ? { appVersion } : {}),
  };
}

export function buildApiLogSystem(req, extra = {}) {
  return normalizeApiLogSystem({
    browser: req?.headers?.browser,
    os: req?.headers?.os,
    runtime: req?.headers?.['x-lightnote-runtime'],
    appVersion: req?.headers?.['x-lightnote-app-version'],
    ...extra,
  });
}

/**
 * 操作日志的环境信息。
 *
 * 只保留展示要用的这几项：operation_logs.system 是 varchar(255)，
 * 不像 api_logs 那样把 fingerprint、routeMatched 一并塞进去 —— 那会把列撑爆并被截断，
 * 截断后的半截 JSON 前端解析不出来，整列就白存了。
 */
export function buildOperationLogSystem(req) {
  const { os, browser, runtime, appVersion } = buildApiLogSystem(req);
  return { os, browser, runtime, ...(appVersion ? { appVersion } : {}) };
}

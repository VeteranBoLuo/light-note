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

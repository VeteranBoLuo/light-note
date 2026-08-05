import { describe, expect, it } from 'vitest';
import { getApiLogAppVersionSuffix, getApiLogRuntimeLabelKey } from './apiLogPresentation';

/*
 * 运行环境后缀。日志里带上 APK 版本才能按版本定位问题 ——
 * 同一个毛病往往只出现在某个版本上。
 */
describe('getApiLogAppVersionSuffix', () => {
  it('Android App 带版本号,前面留一个空格接在环境标签后', () => {
    expect(getApiLogAppVersionSuffix('android-app', '1.0.1')).toBe(' 1.0.1');
  });

  it('非 App 环境不显示版本号 —— 浏览器/PWA 说「版本」没有意义', () => {
    expect(getApiLogAppVersionSuffix('browser', '1.0.1')).toBe('');
    expect(getApiLogAppVersionSuffix('pwa-standalone', '1.0.1')).toBe('');
    expect(getApiLogAppVersionSuffix('unknown', '1.0.1')).toBe('');
    expect(getApiLogAppVersionSuffix(undefined, '1.0.1')).toBe('');
  });

  it('旧版 App 上报不了版本号时不留下孤零零的空格', () => {
    expect(getApiLogAppVersionSuffix('android-app', undefined)).toBe('');
    expect(getApiLogAppVersionSuffix('android-app', '')).toBe('');
    expect(getApiLogAppVersionSuffix('android-app', '   ')).toBe('');
  });
});

describe('getApiLogRuntimeLabelKey', () => {
  it('已知环境各自对应文案', () => {
    expect(getApiLogRuntimeLabelKey('browser')).toBe('apiLog.runtimeValues.browser');
    expect(getApiLogRuntimeLabelKey('pwa-standalone')).toBe('apiLog.runtimeValues.pwa');
    expect(getApiLogRuntimeLabelKey('android-app')).toBe('apiLog.runtimeValues.androidApp');
  });

  it('未知或缺失回落到「未知」,不会渲染出空白单元格', () => {
    expect(getApiLogRuntimeLabelKey(undefined)).toBe('apiLog.runtimeValues.unknown');
    expect(getApiLogRuntimeLabelKey('something-new')).toBe('apiLog.runtimeValues.unknown');
  });
});

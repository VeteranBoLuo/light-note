import { describe, expect, it } from 'vitest';
import { buildApiLogSystem, buildOperationLogSystem, normalizeApiLogSystem } from './apiLogSystem.js';

describe('API 日志系统与运行环境归一化', () => {
  it.each(['iOSapp', 'IOS(app)', 'iOS（app）'])('兼容历史 iOS PWA 格式 %s', (os) => {
    expect(normalizeApiLogSystem({ os, browser: 'Safari' })).toMatchObject({
      os: 'iOS',
      runtime: 'pwa-standalone',
      browser: 'Safari',
    });
  });

  it('新格式分别保留操作系统与 PWA 运行环境', () => {
    expect(
      buildApiLogSystem({
        headers: {
          browser: 'Chrome',
          os: 'macOS',
          'x-lightnote-runtime': 'pwa-standalone',
        },
      }),
    ).toEqual({
      browser: 'Chrome',
      os: 'macOS',
      runtime: 'pwa-standalone',
    });
  });

  it('旧客户端的普通系统值按浏览器环境兼容', () => {
    expect(normalizeApiLogSystem({ os: 'Windows 11' })).toMatchObject({
      os: 'Windows 11',
      runtime: 'browser',
    });
  });

  it('无法识别的显式运行环境不会被伪装成浏览器', () => {
    expect(normalizeApiLogSystem({ os: 'Linux', runtime: 'desktop-shell' })).toMatchObject({
      os: 'Linux',
      runtime: 'unknown',
    });
  });

  it('保留路由命中和指纹等附加审计字段', () => {
    expect(
      buildApiLogSystem(
        { headers: { os: 'Android', 'x-lightnote-runtime': 'android-app' } },
        { fingerprint: 'device-fingerprint', routeMatched: true },
      ),
    ).toMatchObject({
      os: 'Android',
      runtime: 'android-app',
      fingerprint: 'device-fingerprint',
      routeMatched: true,
    });
  });
});

describe('App 版本号', () => {
  it('App 内的请求把版本号带进日志', () => {
    expect(
      buildApiLogSystem({
        headers: {
          browser: 'Chrome',
          os: 'Android',
          'x-lightnote-runtime': 'android-app',
          'x-lightnote-app-version': '1.0.1',
        },
      }),
    ).toEqual({
      browser: 'Chrome',
      os: 'Android',
      runtime: 'android-app',
      appVersion: '1.0.1',
    });
  });

  it('非 App 环境不产生空的 appVersion 字段', () => {
    const system = buildApiLogSystem({ headers: { os: 'Windows 11', browser: 'Chrome' } });
    expect(Object.prototype.hasOwnProperty.call(system, 'appVersion')).toBe(false);
  });

  /*
   * 这个值直接显示在后台日志里，UA 和请求头都是客户端可伪造的，
   * 不能让它变成注入点或把 varchar(255) 撑爆。
   */
  it('异常版本号一律丢弃', () => {
    const cases = ['<script>alert(1)</script>', 'x'.repeat(64), '1.0.1 or 1=1', ''];
    for (const version of cases) {
      const system = buildApiLogSystem({
        headers: { 'x-lightnote-runtime': 'android-app', 'x-lightnote-app-version': version },
      });
      expect(system.appVersion).toBeUndefined();
    }
  });
});

describe('操作日志环境信息', () => {
  it('只保留展示要用的字段,不把 fingerprint 之类塞进 varchar(255)', () => {
    const system = buildOperationLogSystem({
      headers: {
        browser: 'Chrome',
        os: 'Android',
        'x-lightnote-runtime': 'android-app',
        'x-lightnote-app-version': '1.0.1',
        fingerprint: 'abcdef0123456789',
      },
    });
    expect(system).toEqual({ os: 'Android', browser: 'Chrome', runtime: 'android-app', appVersion: '1.0.1' });
  });

  it('浏览器环境不带版本号', () => {
    expect(buildOperationLogSystem({ headers: { os: 'macOS', browser: 'Safari' } })).toEqual({
      os: 'macOS',
      browser: 'Safari',
      runtime: 'browser',
    });
  });
});

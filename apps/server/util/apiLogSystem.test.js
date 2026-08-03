import { describe, expect, it } from 'vitest';
import { buildApiLogSystem, normalizeApiLogSystem } from './apiLogSystem.js';

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

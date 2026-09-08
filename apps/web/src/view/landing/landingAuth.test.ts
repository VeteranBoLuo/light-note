import { describe, expect, it } from 'vitest';
import { getLandingAuthRetryDelay, resolveLandingAuthStatus } from './landingAuth.ts';

describe('resolveLandingAuthStatus', () => {
  it('只将服务端明确的游客结果视为可注册状态', () => {
    expect(resolveLandingAuthStatus('visitor', false)).toBe('anonymous');
    expect(resolveLandingAuthStatus(401, false)).toBe('anonymous');
  });

  it('保留网络或服务端异常的未知状态，避免错误显示注册入口', () => {
    expect(resolveLandingAuthStatus(400, false)).toBe('error');
    expect(resolveLandingAuthStatus(undefined, false)).toBe('error');
  });

  it('已恢复的登录身份优先视为已认证', () => {
    expect(resolveLandingAuthStatus('visitor', true)).toBe('authenticated');
  });
});

describe('getLandingAuthRetryDelay', () => {
  it('按渐进退避自动重试并将最长间隔限制为一分钟', () => {
    expect(getLandingAuthRetryDelay(0)).toBe(2_000);
    expect(getLandingAuthRetryDelay(1)).toBe(5_000);
    expect(getLandingAuthRetryDelay(4)).toBe(60_000);
    expect(getLandingAuthRetryDelay(99)).toBe(60_000);
    expect(getLandingAuthRetryDelay(-1)).toBe(2_000);
  });
});

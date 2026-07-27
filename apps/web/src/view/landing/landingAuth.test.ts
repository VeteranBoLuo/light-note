import { describe, expect, it } from 'vitest';
import { resolveLandingAuthStatus, resolveLandingCtaMode } from './landingAuth.ts';

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

describe('resolveLandingCtaMode', () => {
  it('在登录态尚未确认时不显示注册入口', () => {
    expect(resolveLandingCtaMode('pending', false)).toBe('loading');
  });

  it('只在服务端明确确认游客后显示注册入口', () => {
    expect(resolveLandingCtaMode('anonymous', false)).toBe('register');
  });

  it('登录态确认失败时要求重试，而不是误判为游客', () => {
    expect(resolveLandingCtaMode('error', false)).toBe('retry');
  });

  it('本地已恢复登录身份时始终优先进入应用，避免陈旧响应挡住登录用户', () => {
    expect(resolveLandingCtaMode('pending', true)).toBe('enter');
    expect(resolveLandingCtaMode('anonymous', true)).toBe('enter');
  });

  it('认证状态与本地身份不一致时保持加载态，不降级为注册入口', () => {
    expect(resolveLandingCtaMode('authenticated', false)).toBe('loading');
  });
});

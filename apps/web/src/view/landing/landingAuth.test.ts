import { describe, expect, it } from 'vitest';
import { getLandingAuthRetryDelay, resolveLandingAuthStatus, resolveLandingCtaMode } from './landingAuth.ts';

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
  it('在登录态尚未确认时展示普通开始动作，不暴露内部探测状态', () => {
    expect(resolveLandingCtaMode('pending', false)).toBe('start');
  });

  it('只在服务端明确确认游客后显示注册入口', () => {
    expect(resolveLandingCtaMode('anonymous', false)).toBe('register');
  });

  it('登录态确认失败时保持普通开始动作，而不是要求用户手动重试', () => {
    expect(resolveLandingCtaMode('error', false)).toBe('start');
  });

  it('本地已恢复登录身份时始终优先进入应用，避免陈旧响应挡住登录用户', () => {
    expect(resolveLandingCtaMode('pending', true)).toBe('enter');
    expect(resolveLandingCtaMode('anonymous', true)).toBe('enter');
  });

  it('认证状态与本地身份不一致时保持普通开始动作，不降级为注册入口', () => {
    expect(resolveLandingCtaMode('authenticated', false)).toBe('start');
  });

  // 官网是预渲染静态页，登录态只能挂载后异步确认；本机「近期登录过」的记录
  // 用来消除首屏 CTA 从中性动作跳到「进入我的轻笺」的闪烁。
  it('本机有近期登录记录时，探测未完成也先展示进入应用', () => {
    expect(resolveLandingCtaMode('pending', false, true)).toBe('enter');
    expect(resolveLandingCtaMode('error', false, true)).toBe('enter');
  });

  it('服务端明确返回游客时回退注册入口，本地记录不能覆盖确定结果', () => {
    expect(resolveLandingCtaMode('anonymous', false, true)).toBe('register');
  });

  it('没有本地记录的新访客行为不变', () => {
    expect(resolveLandingCtaMode('pending', false, false)).toBe('start');
    expect(resolveLandingCtaMode('error', false, false)).toBe('start');
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

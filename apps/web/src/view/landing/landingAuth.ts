import type { InjectionKey, Ref } from 'vue';

/**
 * 官网首屏在 Pinia 用户信息恢复完成前，不能把“未加载”误判成“游客”。
 * 该状态只服务官网 CTA，不参与登录、会话或路由鉴权。
 */
export type LandingAuthStatus = 'pending' | 'authenticated' | 'anonymous' | 'error';

export interface LandingAuthContext {
  status: Ref<LandingAuthStatus>;
  retry: () => Promise<unknown>;
}

export const LANDING_AUTH_CONTEXT: InjectionKey<LandingAuthContext> = Symbol('landing-auth-context');

export type LandingCtaMode = 'loading' | 'enter' | 'register' | 'retry';

/**
 * /me 只有明确返回游客才允许显示注册入口；其他非登录成功结果都需要重试确认。
 */
export function resolveLandingAuthStatus(responseStatus: unknown, isLoggedIn: boolean): LandingAuthStatus {
  if (isLoggedIn) return 'authenticated';
  if (responseStatus === 'visitor' || responseStatus === 401) return 'anonymous';
  return 'error';
}

/**
 * 已登录的本地状态优先于一次可能已过时的 /me 响应，避免登录完成后仍被加载态挡住。
 * 反过来，未加载完成绝不能降级显示注册入口，防止已登录用户误触并产生错误埋点。
 */
export function resolveLandingCtaMode(status: LandingAuthStatus, isLoggedIn: boolean): LandingCtaMode {
  if (isLoggedIn) return 'enter';
  if (status === 'anonymous') return 'register';
  if (status === 'error') return 'retry';
  return 'loading';
}

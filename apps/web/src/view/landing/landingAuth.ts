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

export type LandingCtaMode = 'start' | 'enter' | 'register';

const LANDING_AUTH_RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

/**
 * /me 只有明确返回游客才允许显示注册入口；其他非登录成功结果保持未知，
 * 由页面后台自动恢复，不把认证探测变成用户任务。
 */
export function resolveLandingAuthStatus(responseStatus: unknown, isLoggedIn: boolean): LandingAuthStatus {
  if (isLoggedIn) return 'authenticated';
  if (responseStatus === 'visitor' || responseStatus === 401) return 'anonymous';
  return 'error';
}

/**
 * 已登录的本地状态优先于一次可能已过时的 /me 响应，避免登录完成后仍被挡住。
 * 未加载完成或暂时失败时展示普通“开始使用”动作，不暴露登录态探测、重试等内部概念。
 *
 * `hasLoginHint` 是本机「近期登录过」的记录（30 天 TTL，与移动端首访守卫同一份）。
 * 官网是预渲染静态页，登录态只能在挂载后异步确认，期间 CTA 会从中性动作跳到「进入我的轻笺」。
 * 有本地记录时先乐观显示「进入」，等 /me 明确返回游客再回退到注册——回退只发生在
 * 记录还在但会话已失效的少数情况，且「进入」对游客也是可用动作（能浏览示例内容），
 * 不会把用户导向错误结果。没有本地记录的新访客行为完全不变。
 */
export function resolveLandingCtaMode(
  status: LandingAuthStatus,
  isLoggedIn: boolean,
  hasLoginHint = false,
): LandingCtaMode {
  if (isLoggedIn) return 'enter';
  if (status === 'anonymous') return 'register';
  if (hasLoginHint) return 'enter';
  return 'start';
}

/**
 * 官网认证探测采用有上限的渐进退避，避免服务异常时频繁请求；
 * 页面恢复可见或网络恢复时会立即触发，不需要用户手动刷新。
 */
export function getLandingAuthRetryDelay(attempt: number): number {
  const normalizedAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return LANDING_AUTH_RETRY_DELAYS[Math.min(normalizedAttempt, LANDING_AUTH_RETRY_DELAYS.length - 1)];
}

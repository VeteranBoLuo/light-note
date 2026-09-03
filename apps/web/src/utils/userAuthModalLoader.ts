export type UserAuthModalModule = typeof import('@/view/login/UserAuthModal.vue');

let pendingUserAuthModal: Promise<UserAuthModalModule> | null = null;

/**
 * 登录/注册弹窗的唯一异步加载入口。预热与真实打开共用同一个 Promise，
 * 失败后清空缓存，避免一次网络抖动让当前页面永久失去重试能力。
 */
export function loadUserAuthModal(): Promise<UserAuthModalModule> {
  if (pendingUserAuthModal) return pendingUserAuthModal;

  pendingUserAuthModal = import('@/view/login/UserAuthModal.vue').catch((error) => {
    pendingUserAuthModal = null;
    throw error;
  });
  return pendingUserAuthModal;
}

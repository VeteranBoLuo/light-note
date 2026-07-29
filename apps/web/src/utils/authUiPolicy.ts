export interface PassiveAuthUiContext {
  appInitialized: boolean;
  isLandingRoute: boolean;
  isManualLogout: boolean;
}

export interface PassiveAuthUiDecision {
  showAuthModal: boolean;
  showSessionExpiredMessage: boolean;
}

/**
 * 被动身份变化不能替用户表达登录意图。
 * 冷启动、身份初始化和会话失效统一保持认证弹窗关闭；
 * 只有应用运行中的真实会话过期可以显示非阻塞提示。
 */
export function resolvePassiveAuthUi({
  appInitialized,
  isLandingRoute,
  isManualLogout,
}: PassiveAuthUiContext): PassiveAuthUiDecision {
  return {
    showAuthModal: false,
    showSessionExpiredMessage: appInitialized && !isLandingRoute && !isManualLogout,
  };
}

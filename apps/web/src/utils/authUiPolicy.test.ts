import { describe, expect, it } from 'vitest';
import { resolvePassiveAuthUi } from './authUiPolicy';

describe('被动认证 UI 策略', () => {
  it.each([
    {
      name: '冷启动身份初始化',
      context: { appInitialized: false, isLandingRoute: false, isManualLogout: false },
    },
    {
      name: '官网认证探测',
      context: { appInitialized: true, isLandingRoute: true, isManualLogout: false },
    },
    {
      name: '用户手动退出',
      context: { appInitialized: true, isLandingRoute: false, isManualLogout: true },
    },
    {
      name: '应用运行中会话过期',
      context: { appInitialized: true, isLandingRoute: false, isManualLogout: false },
    },
  ])('$name 都不自动打开登录注册', ({ context }) => {
    expect(resolvePassiveAuthUi(context).showAuthModal).toBe(false);
  });

  it('只有应用运行中的真实会话过期显示非阻塞提示', () => {
    expect(
      resolvePassiveAuthUi({
        appInitialized: true,
        isLandingRoute: false,
        isManualLogout: false,
      }).showSessionExpiredMessage,
    ).toBe(true);

    expect(
      resolvePassiveAuthUi({
        appInitialized: false,
        isLandingRoute: false,
        isManualLogout: false,
      }).showSessionExpiredMessage,
    ).toBe(false);
  });
});

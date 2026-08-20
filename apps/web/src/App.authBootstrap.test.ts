import { describe, expect, it } from 'vitest';
import appSource from './App.vue?raw';
import mainSource from './main.ts?raw';
import loginSource from './components/login/LoginPage.vue?raw';
import registerSource from './components/login/RegisterPage.vue?raw';
import githubCallbackSource from './view/auth/callback/GithubCallBack.vue?raw';

describe('应用冷启动身份恢复', () => {
  it('身份未知时阻止业务路由露出，接口异常只进入可重试状态', () => {
    const getUserInfoBlock = appSource.slice(
      appSource.indexOf('async function getUserInfo'),
      appSource.indexOf('// 应用主题样式'),
    );

    expect(appSource).toContain('v-if="applicationAuthGateVisible"');
    expect(getUserInfoBlock).toContain('isDefinitiveAuthResultStatus(responseStatus)');
    expect(getUserInfoBlock).toContain("applicationAuthStatus.value = 'error'");
    expect(getUserInfoBlock).not.toContain('handleUserLogout(');
  });

  it('原生首屏就绪通知晚于身份初始化及恢复页绘制', () => {
    const mountedBlock = appSource.slice(appSource.indexOf('onMounted(async () =>'), appSource.indexOf('// 解绑媒体'));
    expect(mountedBlock.indexOf('await init()')).toBeGreaterThanOrEqual(0);
    expect(mountedBlock.indexOf('await notifyAndroidInitialViewReady()')).toBeGreaterThan(
      mountedBlock.indexOf('await init()'),
    );
    expect(mainSource).not.toContain('postAndroidAppReady');
  });

  it('保留记住账号选项及默认值，并让所有登录签发路径通知 Android 落盘 Cookie', () => {
    expect(loginSource).toContain('const isCheck = ref(true)');
    expect(loginSource).toContain('<BCheckbox v-model:checked="isCheck"');
    expect(loginSource).toContain('persistAndroidAuthSession()');
    expect(registerSource).toContain('persistAndroidAuthSession()');
    expect(githubCallbackSource).toContain("localStorage.setItem('rememberedSid', cRes.data.sid)");
    expect(githubCallbackSource).toContain('persistAndroidAuthSession()');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const quickSaveSource = readSource('src/view/quickSave/QuickSave.vue');
const loginSource = readSource('src/components/login/LoginPage.vue');
const registerSource = readSource('src/components/login/RegisterPage.vue');
const githubCallbackSource = readSource('src/view/auth/callback/GithubCallBack.vue');

describe('快速收藏认证回跳接线', () => {
  it('离开收藏弹窗前保存完整回跳目标', () => {
    expect(quickSaveSource).toContain('rememberQuickSaveAuthReturnPath(returnPath)');
    expect(quickSaveSource).toContain("'/login?redirect=' + encodeURIComponent(returnPath)");
  });

  it.each([
    ['邮箱登录', loginSource],
    ['邮箱注册', registerSource],
    ['GitHub OAuth', githubCallbackSource],
  ])('%s 成功后优先返回快速收藏并清理一次性意图', (_name, source) => {
    expect(source).toContain('resolveQuickSaveAuthReturnPath()');
    expect(source).toContain('clearQuickSaveAuthReturnPath()');
  });
});

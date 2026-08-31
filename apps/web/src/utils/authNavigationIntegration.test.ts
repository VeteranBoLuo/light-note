import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const read = (path: string) => readFileSync(resolve(sourceRoot, path), 'utf8');

describe('受保护导航认证回跳接线', () => {
  it('路由守卫在当前应用上下文打开登录，并取消游客目标导航', () => {
    const app = read('App.vue');
    expect(app).toContain('resolveRouteAuthDecision({');
    expect(app).toContain("bookmark.openAuthModal('登录', 'preview_guide', to.fullPath)");
    expect(app).toMatch(/routeAuthDecision === 'prompt-auth'[\s\S]*?next\(false\)/u);
  });

  it.each([
    'components/login/LoginPage.vue',
    'components/login/RegisterPage.vue',
    'view/auth/callback/GithubCallBack.vue',
  ])('%s 在认证成功后消费并清理同一受保护导航意图', (path) => {
    const source = read(path);
    expect(source).toContain('resolveAuthNavigationIntent()');
    expect(source).toContain('clearAuthNavigationIntent()');
  });

  it('用户取消登录会清理意图，避免下一次普通登录误回旧页面', () => {
    const modal = read('view/login/UserAuthModal.vue');
    expect(modal).toMatch(/function closeModal\(\)[\s\S]*?clearAuthNavigationIntent\(\)/u);
  });
});

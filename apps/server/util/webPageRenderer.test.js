import { afterEach, describe, expect, it } from 'vitest';
import {
  getWebPageRendererRuntimeState,
  resolveWebRendererExecutable,
  webPageRendererInternals,
} from './webPageRenderer.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('webPageRenderer parent boundary', () => {
  it('配置的浏览器路径不存在时明确判为不可用', () => {
    process.env.WEB_PAGE_RENDERER_EXECUTABLE_PATH = '/definitely/missing/chrome';
    expect(resolveWebRendererExecutable()).toBe('');
  });

  it('传给低权限子进程的环境不包含数据库或 AI 密钥', () => {
    process.env.DB_PASSWORD = 'secret';
    process.env.DEEPSEEK_API_KEY = 'secret';
    const environment = webPageRendererInternals.sanitizedChildEnvironment('/tmp/render-home');
    expect(environment).toMatchObject({ HOME: '/tmp/render-home', TMPDIR: '/tmp/render-home' });
    expect(environment).not.toHaveProperty('DB_PASSWORD');
    expect(environment).not.toHaveProperty('DEEPSEEK_API_KEY');
  });

  it('只接受结构正确的 runner JSON', () => {
    expect(webPageRendererInternals.parseRunnerOutput('{"ok":false,"reason":"ACCESS_CHALLENGE"}')).toEqual({
      ok: false,
      reason: 'ACCESS_CHALLENGE',
    });
    expect(webPageRendererInternals.parseRunnerOutput('{"reason":"missing ok"}')).toBeNull();
    expect(webPageRendererInternals.parseRunnerOutput('not-json')).toBeNull();
  });

  it('运行时状态显式暴露开关而不泄露其他环境', () => {
    process.env.WEB_PAGE_RENDERER_ENABLED = 'false';
    expect(getWebPageRendererRuntimeState()).toMatchObject({ enabled: false });
  });
});

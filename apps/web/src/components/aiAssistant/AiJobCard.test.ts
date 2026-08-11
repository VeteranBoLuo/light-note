// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import type { AiArtifact } from '@/types/aiArtifact';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), error: vi.fn() }));

vi.mock('@/http/request.ts', () => ({ apiBaseGet: api.get, apiBasePost: api.post }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { error: api.error },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<span aria-hidden="true"></span>' },
}));

const { default: AiJobCard } = await import('./AiJobCard.vue');

function artifact(overrides: Partial<AiArtifact> = {}): AiArtifact {
  return {
    id: 'bookmark-health:latest',
    kind: 'job',
    schemaVersion: 1,
    status: 'succeeded',
    titleKey: 'ai.artifact.bookmarkHealth.title',
    generatedAt: '2026-08-10T12:00:00.000Z',
    revision: 3,
    data: {
      jobType: 'bookmark_health',
      jobId: 'latest',
      total: 2,
      checked: 2,
      alive: 1,
      suspect: 1,
      unknown: 0,
      lastCheckedAt: '2026-08-10T12:00:00.000Z',
      pollAfterMs: 2500,
      suspects: [],
    },
    ...overrides,
  };
}

let cleanup: (() => void) | undefined;

function mountCard(onUpdated = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(AiJobCard, { artifact: artifact(), onUpdated });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onUpdated };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
});

describe('AiJobCard', () => {
  it('重新体检调用真实后端入口，并用返回的任务更新卡片', async () => {
    api.post.mockResolvedValue({
      status: 200,
      data: {
        runId: 'run-2',
        running: true,
        runStatus: 'running',
        total: 214,
        checked: 0,
        alive: 0,
        suspectCount: 0,
        unknown: 0,
      },
    });
    const { host, onUpdated } = mountCard();
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes('重新体检'),
    );
    expect(button).toBeTruthy();

    button?.click();
    await flush();

    expect(api.post).toHaveBeenCalledWith('/api/bookmark/health/checkAll');
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 'bookmark-health:run-2', status: 'running' }));
    expect(host.textContent).toContain('检查中');
    expect(host.textContent).toContain('已检查 0 / 214');
  });

  it('启动失败时保留原结果并使用全局消息提示', async () => {
    api.post.mockRejectedValue(new Error('network'));
    const { host, onUpdated } = mountCard();
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes('重新体检'),
    );

    button?.click();
    await flush();

    expect(onUpdated).not.toHaveBeenCalled();
    expect(api.error).toHaveBeenCalledWith('死链体检暂时无法启动，请稍后重试。');
    expect(host.textContent).toContain('最近一次真实体检结果');
  });
});

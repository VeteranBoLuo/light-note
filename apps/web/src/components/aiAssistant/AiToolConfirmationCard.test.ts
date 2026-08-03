// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import type { AiToolConfirmation } from '@/types/aiAgent';

const api = vi.hoisted(() => ({
  post: vi.fn(),
  recordOperation: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/http/request.ts', () => ({ apiBasePost: api.post }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: api.recordOperation }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: api.success, warning: api.warning, error: api.error },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<span aria-hidden="true"></span>' },
}));

const { default: AiToolConfirmationCard } = await import('./AiToolConfirmationCard.vue');

let cleanup: (() => void) | undefined;

function createConfirmation(overrides: Partial<AiToolConfirmation> = {}): AiToolConfirmation {
  return {
    token: 'token',
    id: 'confirmation-1',
    sessionId: 'session-1',
    toolName: 'create_note',
    expiresIn: 300,
    riskLevel: 'low',
    args: {
      title: '旅行计划',
      content: '# 深圳四日游\n\n- 世界之窗\n- 深圳湾公园\n\n<script>alert(1)</script>',
    },
    preview: {
      target: '旅行计划',
      impact: '确认后将创建一篇 Markdown 笔记',
    },
    ...overrides,
  };
}

function mountCard(confirmation = createConfirmation()) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(AiToolConfirmationCard, { confirmation });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

function findButton(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

async function flush() {
  await Promise.resolve();
  await nextTick();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
});

describe('AiToolConfirmationCard note preview', () => {
  it('默认安全渲染 Markdown，并允许切换查看完整原文', async () => {
    const host = mountCard();

    const rendered = host.querySelector('.confirmation-note-preview__rendered');
    expect(rendered?.querySelector('h1')?.textContent).toBe('深圳四日游');
    expect(rendered?.querySelectorAll('li')).toHaveLength(2);
    expect(rendered?.innerHTML).not.toContain('<script');
    expect(host.textContent).not.toContain('"content"');

    findButton(host, '查看 Markdown 原文').click();
    await flush();

    expect(host.querySelector('.confirmation-note-preview__rendered')).toBeNull();
    expect(host.querySelector('.confirmation-note-preview__source')?.textContent).toContain('# 深圳四日游');
    expect(findButton(host, '查看渲染效果')).toBeTruthy();
  });

  it('收到可信执行回执后收起正文预览并展示成功结果', async () => {
    api.post.mockResolvedValue({
      status: 200,
      data: {
        actionReceipt: {
          actionId: 'confirmation-1',
          toolName: 'create_note',
          status: 'succeeded',
          summary: '笔记「旅行计划」已创建成功',
          completedAt: '2026-08-03T12:00:00.000Z',
        },
      },
    });
    const host = mountCard();

    findButton(host, '确认执行').click();
    await flush();

    expect(host.querySelector('.confirmation-note-preview')).toBeNull();
    expect(host.textContent).toContain('笔记「旅行计划」已创建成功');
    expect(api.success).toHaveBeenCalled();
  });

  it('其他通用工具仍沿用原参数兜底展示', () => {
    const host = mountCard(
      createConfirmation({
        toolName: 'create_bookmark',
        args: { name: 'OpenAI', url: 'https://openai.com' },
        preview: { target: 'OpenAI', impact: '确认后创建书签' },
      }),
    );

    expect(host.querySelector('.confirmation-note-preview')).toBeNull();
    expect(host.textContent).toContain('"url": "https://openai.com"');
  });
});

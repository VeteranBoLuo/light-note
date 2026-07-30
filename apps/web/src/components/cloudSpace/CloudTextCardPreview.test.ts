import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import CloudTextCardPreview from './CloudTextCardPreview.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

type MountedPreview = {
  host: HTMLElement;
  unmount: () => void;
};

const mounted: MountedPreview[] = [];

function mockTextResponse(source: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      body: null,
      text: async () => source,
    })),
  );
}

async function flushPreview() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}

async function mountPreview(fileInfo: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(CloudTextCardPreview, { fileInfo });
    },
  });
  app.mount(host);
  const result = {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
  mounted.push(result);
  await flushPreview();
  return result;
}

async function waitForSelector<T extends Element>(host: HTMLElement, selector: string): Promise<T | null> {
  for (let index = 0; index < 80; index += 1) {
    const match = host.querySelector<T>(selector);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await nextTick();
  }
  return null;
}

beforeEach(() => {
  delete (globalThis as any).__LIGHT_NOTE_CLOUD_TEXT_PREVIEW_CACHE__;
  delete (globalThis as any).__LIGHT_NOTE_CLOUD_TEXT_PREVIEW_SCHEDULER__;
});

afterEach(() => {
  mounted.splice(0).forEach((item) => item.unmount());
  vi.unstubAllGlobals();
});

describe('CloudTextCardPreview', () => {
  it('在隔离且不可交互的 iframe 中展示 HTML，不把脚本、链接和表单能力带入卡片', async () => {
    mockTextResponse(`
      <!doctype html>
      <html>
        <body>
          <h1 onclick="window.clicked = true">开发修复计划</h1>
          <a href="https://example.com">不能点击的链接</a>
          <input type="checkbox" checked />
          <script>window.started = true</script>
        </body>
      </html>
    `);

    const { host } = await mountPreview({
      id: 'html-card',
      fileName: '开发修复计划.html',
      fileType: 'text/html',
      fileUrl: 'https://files.example/plan.html',
      category: 'text',
    });

    const root = host.querySelector<HTMLElement>('.cloud-text-card-preview');
    const iframe = await waitForSelector<HTMLIFrameElement>(host, '.cloud-text-card-preview__frame');
    const srcdoc = iframe?.getAttribute('srcdoc') || '';

    expect(root?.hasAttribute('inert')).toBe(true);
    expect(root?.style.pointerEvents).toBe('none');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toBe('');
    expect(iframe?.getAttribute('tabindex')).toBe('-1');
    expect(iframe?.style.pointerEvents).toBe('none');
    expect(srcdoc).toContain('开发修复计划');
    expect(srcdoc).toContain("script-src 'none'");
    expect(srcdoc).not.toContain('<script>');
    expect(srcdoc).not.toContain('onclick=');
    expect(srcdoc).not.toContain('href=');
    expect(srcdoc).toContain('disabled=""');
  });

  it('把 Markdown 渲染为经过消毒的标题和任务列表，不显示 Markdown 源码', async () => {
    mockTextResponse('# 开发修复计划\n\n- [x] 修复卡片预览\n- [ ] 完成回归\n\n[链接](https://example.com)');

    const { host } = await mountPreview({
      id: 'markdown-card',
      fileName: '开发修复计划.md',
      fileType: 'text/markdown',
      fileUrl: 'https://files.example/plan.md',
      category: 'text',
    });

    const documentPreview = host.querySelector<HTMLElement>('.cloud-text-card-preview__document');
    const checkbox = documentPreview?.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(documentPreview?.querySelector('h1')?.textContent).toBe('开发修复计划');
    expect(documentPreview?.textContent).not.toContain('# 开发修复计划');
    expect(documentPreview?.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(checkbox?.disabled).toBe(true);
    expect(checkbox?.getAttribute('tabindex')).toBe('-1');
  });

  it('普通文本仍按纯文本展示，不会把其中的标签当成 HTML 执行', async () => {
    mockTextResponse('普通日志 <script>window.started = true</script>');

    const { host } = await mountPreview({
      id: 'text-card',
      fileName: '运行日志.txt',
      fileType: 'text/plain',
      fileUrl: 'https://files.example/run.txt',
      category: 'text',
    });

    const plainPreview = host.querySelector<HTMLElement>('.cloud-text-card-preview__plain');
    expect(plainPreview?.textContent).toContain('<script>window.started = true</script>');
    expect(plainPreview?.querySelector('script')).toBeNull();
  });
});

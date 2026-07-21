import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import AiSourceList from './AiSourceList.vue';
import type { AiSource, AiSourceCoverage } from './aiSourceNavigation';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function completeCoverage(): AiSourceCoverage {
  return {
    metadataAvailable: true,
    complete: true,
    truncated: false,
    coverageRatio: 1,
    total: { chars: 100, pages: 1, chunks: 1 },
    processed: { chars: 100, pages: 1, chunks: 1 },
  };
}

function mountList(locale: 'zh-CN' | 'en-US', sources: AiSource[], onSelect = () => {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(AiSourceList, { sources, onSelect });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale,
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  );
  app.component('OriginalIcon', { render: () => h('span', { 'data-test-icon': '' }) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('AiSourceList', () => {
  it('英文模式下本地化来源类型、定位和覆盖状态，并保持导航交互', () => {
    const sources: AiSource[] = [
      {
        type: 'document',
        id: 'document-1',
        title: 'report.pdf',
        locator: { page: 3 },
        coverage: completeCoverage(),
        sourceType: 'temporary',
        target: 'temporary-document',
        url: 'https://example.com/report.pdf',
      },
      {
        type: 'todo',
        id: 'todo-1',
        title: '',
        target: 'todo-inbox',
      },
    ];
    const onSelect = vi.fn();
    const host = mountList('en-US', sources, onSelect);

    expect(host.textContent).toContain('Page 3');
    expect(host.textContent).toContain('Complete');
    expect(host.textContent).toContain('To-do');
    expect(host.querySelector('.ai-source-list__coverage')?.getAttribute('aria-label')).toBe(
      'Document coverage: Complete',
    );
    expect(host.textContent).not.toContain('完整');
    expect(host.textContent).not.toContain('待办');

    host.querySelector<HTMLButtonElement>('button.ai-source-list__item')?.click();
    expect(onSelect).toHaveBeenCalledWith(sources[0]);
  });
});

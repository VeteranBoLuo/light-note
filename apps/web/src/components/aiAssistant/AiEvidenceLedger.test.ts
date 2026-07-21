import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { getAiEvidenceAnchorId } from '@/utils/aiMessageRender';
import AiEvidenceLedger from './AiEvidenceLedger.vue';
import type { AiEvidenceReference, AiResolvedEvidence, AiSource } from './aiSourceNavigation';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountLedger(
  sources: AiSource[],
  evidence: AiEvidenceReference[],
  onSelect: (source: AiSource, item: AiResolvedEvidence) => void = () => {},
  initialGroupLimit = 6,
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
  anchorScope = '',
) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(AiEvidenceLedger, { sources, evidence, onSelect, initialGroupLimit, anchorScope });
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

describe('AiEvidenceLedger', () => {
  const sources: AiSource[] = [
    {
      type: 'note',
      id: 'note-1',
      sourceId: 'source-note',
      resourceId: 'note-1',
      title: '产品研究笔记',
      target: 'note-detail',
      resourceVersion: 'v3',
    },
    {
      type: 'todo',
      id: 'todo-1',
      sourceId: 'source-todo',
      resourceId: 'todo-1',
      title: '验证转化数据',
      target: 'todo-inbox',
    },
  ];

  const evidence: AiEvidenceReference[] = [
    {
      citationKey: '1',
      evidenceRef: 'ev-note',
      sourceId: 'source-note',
      locator: { type: 'section', value: '核心结论' },
      excerpt: '移动端用户更关注一次完成率。',
    },
    {
      citationKey: '1',
      evidenceRef: 'ev-todo-grouped',
      sourceId: 'source-todo',
      locator: { type: 'status', value: '未完成' },
      excerpt: '仍需验证近三十天的转化数据。',
    },
    {
      citationKey: '2',
      evidenceRef: 'ev-todo-resource',
      resourceId: 'todo-1',
      locator: { page: 3 },
      excerpt: '来源通过 resourceId 关联。',
    },
  ];

  it('按 citationKey 展示来源、定位和短摘录，并支持点击打开来源', () => {
    const onSelect = vi.fn();
    const host = mountLedger(sources, evidence, onSelect);

    expect(host.textContent).toContain('证据账本');
    expect(host.textContent).toContain('2 组可核验证据');
    expect(host.textContent).toContain('[1]');
    expect(host.textContent).toContain('2 条证据');
    expect(host.textContent).toContain('产品研究笔记');
    expect(host.textContent).toContain('定位：章节 · 核心结论');
    expect(host.textContent).toContain('版本：v3');
    expect(host.textContent).toContain('移动端用户更关注一次完成率。');
    expect(host.textContent).toContain('验证转化数据');
    expect(host.textContent).toContain('定位：第 3 页');
    expect(host.querySelector('#ai-evidence-1')?.getAttribute('tabindex')).toBe('-1');

    const buttons = host.querySelectorAll<HTMLButtonElement>('button.ai-evidence__item');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute('role')).toBe('link');
    expect(buttons[0].getAttribute('aria-label')).toBe('打开来源：产品研究笔记');
    buttons[0].click();
    expect(onSelect).toHaveBeenCalledWith(sources[0], expect.objectContaining({ evidenceRef: 'ev-note' }));
  });

  it('可通过键盘打开待办来源', () => {
    const onSelect = vi.fn();
    const host = mountLedger(sources, evidence, onSelect);
    const todoButton = [...host.querySelectorAll<HTMLButtonElement>('button.ai-evidence__item')].find((button) =>
      button.textContent?.includes('验证转化数据'),
    );

    todoButton?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onSelect).toHaveBeenCalledWith(sources[1], expect.objectContaining({ sourceId: 'source-todo' }));
  });

  it('没有逐条证据时明确说明来源列表不等于引用证据', () => {
    const host = mountLedger(sources, []);
    const empty = host.querySelector<HTMLElement>('[role="status"]');

    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('暂无可核验的逐条证据');
    expect(empty?.textContent).toContain('不能据此视为逐项引用');
    expect(host.querySelectorAll('.ai-evidence__group')).toHaveLength(0);
  });

  it('证据组较多时渐进展开，避免在移动端一次铺满长列表', async () => {
    const manyEvidence = Array.from({ length: 7 }, (_, index) => ({
      citationKey: String(index + 1),
      evidenceRef: `ev-${index + 1}`,
      sourceId: 'source-note',
      excerpt: `证据 ${index + 1}`,
    }));
    const host = mountLedger(sources, manyEvidence, () => {}, 3);

    expect(host.querySelectorAll('.ai-evidence__group')).toHaveLength(3);
    const toggle = host.querySelector<HTMLButtonElement>('.ai-evidence__toggle');
    expect(toggle?.textContent).toContain('展开其余 4 组');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    toggle?.click();
    await nextTick();
    expect(host.querySelectorAll('.ai-evidence__group')).toHaveLength(7);
    expect(toggle?.textContent).toContain('收起证据');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  });

  it('英文模式下证据定位和操作文案不回退为中文', () => {
    const host = mountLedger(sources, evidence, () => {}, 6, 'en-US');

    expect(host.textContent).toContain('Evidence ledger');
    expect(host.textContent).toContain('2 verifiable evidence groups');
    expect(host.textContent).toContain('Location: Section · 核心结论');
    expect(host.textContent).toContain('Location: Page 3');
    expect(host.querySelector<HTMLButtonElement>('button.ai-evidence__item')?.getAttribute('aria-label')).toBe(
      'Open source: 产品研究笔记',
    );
    expect(host.textContent).not.toContain('证据账本');
  });

  it('使用消息作用域隔离引用锚点，命中折叠组时自动展开并聚焦', async () => {
    const manyEvidence = Array.from({ length: 7 }, (_, index) => ({
      citationKey: String(index + 1),
      evidenceRef: `scoped-${index + 1}`,
      sourceId: 'source-note',
      excerpt: `证据 ${index + 1}`,
    }));
    const anchorScope = 'message-42';
    const host = mountLedger(sources, manyEvidence, () => {}, 3, 'zh-CN', anchorScope);
    const scopedId = getAiEvidenceAnchorId('7', anchorScope);

    expect(scopedId).not.toBe(getAiEvidenceAnchorId('7'));
    const proxy = document.getElementById(scopedId);
    expect(proxy?.classList.contains('ai-evidence__anchor-proxy')).toBe(true);

    proxy?.focus();
    await nextTick();
    await nextTick();

    expect(host.querySelectorAll('.ai-evidence__group')).toHaveLength(7);
    expect(document.getElementById(scopedId)?.classList.contains('ai-evidence__group')).toBe(true);
    expect(document.activeElement?.id).toBe(scopedId);
  });
});

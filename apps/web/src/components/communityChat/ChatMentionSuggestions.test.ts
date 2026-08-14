import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import componentSource from './ChatMentionSuggestions.vue?raw';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span class="svg-icon-stub" />' },
}));

const { default: ChatMentionSuggestions } = await import('./ChatMentionSuggestions.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountSuggestions(props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatMentionSuggestions, props);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('ChatMentionSuggestions', () => {
  it('默认推荐所有人时保持普通行，加载反馈与候选列表分层', () => {
    const host = mountSuggestions({ showEveryone: true, loading: true });
    const everyone = host.querySelector<HTMLElement>('.chat-mention-suggestions__everyone');
    const body = host.querySelector<HTMLElement>('.chat-mention-suggestions__body');
    const list = host.querySelector<HTMLElement>('.chat-mention-suggestions__list');
    const loading = host.querySelector<HTMLElement>('.chat-mention-suggestions__loading');

    expect(body?.classList.contains('is-loading')).toBe(true);
    expect(everyone?.classList.contains('is-active')).toBe(false);
    expect(everyone?.getAttribute('aria-selected')).toBe('false');
    expect(everyone?.querySelector('.chat-mention-suggestions__copy strong')?.textContent).toBe(
      zhCN.communityChat.mentionSearch.everyone,
    );
    expect(list?.contains(loading)).toBe(false);
  });

  it('覆盖 BButton 固定高度并只用左侧实色边标表达键盘选中态', () => {
    expect(componentSource).toContain('height: min(360px, 42vh)');
    expect(componentSource).toContain('height: min(300px, calc(var(--mobile-visible-viewport-height, 100vh) * 0.38))');
    expect(componentSource).toContain('grid-auto-rows: max-content');
    expect(componentSource).toContain('min-height: 105px');
    expect(componentSource).toContain('max-height: calc(100% - 72px)');
    expect(componentSource).toContain('flex: 1 1 auto');
    expect(componentSource).toContain('height: auto !important');
    expect(componentSource).toContain('line-height: 1.35 !important');
    expect(componentSource).toContain('border-left-color: var(--primary-color) !important');
    expect(componentSource).toContain('background: var(--hover-background) !important');
    expect(componentSource).not.toContain('border-color: var(--primary-color);');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import PinBadge from './PinBadge.vue';
import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
import NoteFormatBadge from '@/components/noteLibrary/library/NoteFormatBadge.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountBadges() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () => h('div', [h(PinBadge), h(InboxPendingBadge), h(NoteFormatBadge, { type: 'markdown' })]),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          common: { pin: '置顶' },
          inbox: { pendingBadge: '待整理' },
          note: { formatMarkdown: 'Markdown', formatRichText: '富文本' },
        },
      },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('共享语义徽章', () => {
  it('置顶、待整理和格式分别锁定 pin/pending/neutral tone', () => {
    const host = mountBadges();
    const badges = [
      host.querySelector('.pin-badge'),
      host.querySelector('.inbox-pending-badge'),
      host.querySelector('.note-format-badge'),
    ];
    expect(badges[0]?.classList.contains('b-chip--pin')).toBe(true);
    expect(badges[1]?.classList.contains('b-chip--pending')).toBe(true);
    expect(badges[2]?.classList.contains('b-chip--neutral')).toBe(true);
    expect(badges.every((badge) => badge?.tagName === 'SPAN')).toBe(true);
  });

  it('格式徽章保留可读全称，视觉只显示紧凑缩写', () => {
    const host = mountBadges();
    const formatBadge = host.querySelector('.note-format-badge');
    expect(formatBadge?.textContent?.trim()).toBe('MD');
    expect(formatBadge?.getAttribute('title')).toBe('Markdown');
    expect(formatBadge?.getAttribute('aria-label')).toBe('Markdown');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import AchievementUnlockOverlay from './AchievementUnlockOverlay.vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('./AchievementEmblem.vue', () => ({
  default: {
    props: ['achievementKey', 'group', 'size', 'animated'],
    render: () => h('span', { class: 'emblem-stub' }),
  },
}));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
});

function mountOverlay() {
  const onClose = vi.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () =>
      h(AchievementUnlockOverlay, {
        achievementKey: 'annual_review_2026',
        group: 'tenure',
        kicker: '获得纪念成就',
        name: '年度回望 · 2026',
        description: '2026 年的回望，已收进你的成就墙',
        onClose,
      }),
  });
  app.mount(host);
  cleanup = () => app.unmount();
  const mask = () => document.body.querySelector<HTMLElement>('.achu-mask');
  return { onClose, mask };
}

describe('AchievementUnlockOverlay', () => {
  it('shows the achievement as a labelled dialog in its family palette', () => {
    const { mask } = mountOverlay();
    expect(mask()?.getAttribute('role')).toBe('dialog');
    expect(document.getElementById(mask()!.getAttribute('aria-labelledby')!)?.textContent).toBe('年度回望 · 2026');
    expect(mask()?.textContent).toContain('获得纪念成就');
    expect(mask()?.textContent).toContain('growth.levelUpDismiss');
    expect(document.body.querySelector('.emblem-stub')).not.toBeNull();
    const stage = document.body.querySelector<HTMLElement>('.achu-stage');
    expect(stage?.style.getPropertyValue('--achievement-accent')).toBe('#62a92f');
  });

  it('closes on click', async () => {
    const { onClose, mask } = mountOverlay();
    mask()!.click();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mask()).toBeNull());
  });

  it('closes on Escape', async () => {
    const { onClose, mask } = mountOverlay();
    mask()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

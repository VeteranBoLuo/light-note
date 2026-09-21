import { expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { MOBILE_LAYOUT_CONTEXT } from '@/composables/useMobileLayout';
import Menu from './CommunityContentMenu.vue';
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/base/BasicComponents/BActionMenu.vue', () => ({
  default: {
    props: ['items', 'disabled'],
    template: `<div><button v-for="item in items" :key="item.key" :disabled="disabled" :data-danger="item.danger" @click="$emit('select', item.key)">{{ item.key }}</button></div>`,
  },
}));
it.each([
  [true, false, ['withdraw', 'delete']],
  [true, true, ['withdraw']],
  [false, false, ['report']],
  [false, true, ['report']],
] as const)('limits actions by ownership and content kind (%s, %s)', (own, comment, actions) => {
  const host = document.createElement('div');
  const selected = vi.fn();
  const app = createApp(Menu, { own, comment, onSelect: selected });
  app.mount(host);
  const buttons = Array.from(host.querySelectorAll('button'));
  expect(buttons.map((button) => button.textContent)).toEqual(actions);
  for (const button of buttons) {
    button.click();
    expect(selected).toHaveBeenLastCalledWith(button.textContent);
    if (button.textContent === 'delete') expect(button.dataset.danger).toBe('true');
    if (button.textContent === 'withdraw') expect(button.dataset.danger).toBe(String(comment));
  }
  app.unmount();
});

vi.mock('@/components/mobile/MobilePageActionsDrawer.vue', () => ({
  default: {
    props: ['open', 'actions'],
    template: `<div v-if="open" role="menu"><button v-for="action in actions" :key="action.key" :disabled="action.disabled" :data-danger="action.danger" :data-divider="action.dividerBefore" @click="$emit('action', action)">{{ action.key }}</button></div>`,
  },
}));
it.each([
  [true, false, false, ['save-note', 'save-bookmark', 'copy-link', 'withdraw', 'delete']],
  [false, false, false, ['save-note', 'save-bookmark', 'copy-link', 'report']],
  [true, true, false, ['withdraw']],
  [false, false, true, ['copy-link']],
] as const)(
  'uses the same mobile permissions and forwards actions (%s, %s, %s)',
  async (own, comment, readonly, expected) => {
    const host = document.createElement('div');
    const selected = vi.fn();
    const app = createApp(Menu, { own, comment, readonly, saveActions: !comment, canSave: true, onSelect: selected });
    app.provide(MOBILE_LAYOUT_CONTEXT, ref(true));
    app.mount(host);
    try {
      host.querySelector<HTMLButtonElement>('.community-content-more')!.click();
      await nextTick();
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('[role=menu] button')];
      expect(buttons.map((button) => button.textContent)).toEqual(expected);
      for (const button of buttons) {
        button.click();
        expect(selected).toHaveBeenLastCalledWith(button.textContent);
      }
      const withdraw = buttons.find((button) => button.textContent === 'withdraw');
      if (own && !comment && !readonly) expect(withdraw?.dataset.divider).toBe('true');
      if (comment) expect(withdraw?.dataset.danger).toBe('true');
    } finally {
      app.unmount();
    }
  },
);

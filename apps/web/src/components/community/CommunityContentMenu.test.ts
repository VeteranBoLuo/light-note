import { expect, it, vi } from 'vitest';
import { createApp } from 'vue';
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
